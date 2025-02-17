import { Dispatcher } from '../dispatcher';
import CID from 'cids';
import { TileDocument } from '@ceramicnetwork/doctype-tile';
import StreamID from '@ceramicnetwork/streamid';
import {
  CommitType,
  DocState,
  StreamHandler,
  LoggerProvider,
} from '@ceramicnetwork/common';
import { serialize, MsgType } from '../pubsub/pubsub-message';
import { Repository, RepositoryDependencies } from '../state-management/repository';
import { delay } from '../pubsub/__tests__/delay';
import tmp from 'tmp-promise';
import { LevelStateStore } from '../store/level-state-store';
import { PinStore } from '../store/pin-store';
import { RunningState } from '../state-management/running-state';
import { StateManager } from '../state-management/state-manager';

const TOPIC = '/ceramic';
const FAKE_CID = new CID('bafybeig6xv5nwphfmvcnektpnojts33jqcuam7bmye2pb54adnrtccjlsu');
const FAKE_CID2 = new CID('bafybeig6xv5nwphfmvcnektpnojts44jqcuam7bmye2pb54adnrtccjlsu');
const FAKE_DOC_ID = StreamID.fromString('kjzl6cwe1jw147dvq16zluojmraqvwdmbh61dx9e0c59i344lcrsgqfohexp60s');

const ipfs = {
  pubsub: {
    ls: jest.fn(async () => Promise.resolve([])),
    subscribe: jest.fn(),
    unsubscribe: jest.fn(async () => Promise.resolve()),
    publish: jest.fn(),
  },
  dag: {
    put: jest.fn(() => FAKE_CID),
    get: jest.fn(() => ({ value: 'data' })),
  },
  block: {
    stat: jest.fn(() => ({ size: 10 })),
  },
  id: async () => ({ id: 'ipfsid' }),
};

class TileDocumentMock extends TileDocument {
  get doctype() {
    return 'tile';
  }
}

const fakeHandler = ({
  doctype: TileDocumentMock,
} as unknown) as StreamHandler<TileDocumentMock>;

describe('Dispatcher', () => {
  let dispatcher: Dispatcher;
  let repository: Repository;
  const loggerProvider = new LoggerProvider();

  beforeEach(async () => {
    ipfs.dag.put.mockClear();
    ipfs.dag.get.mockClear();
    ipfs.pubsub.subscribe.mockClear();
    ipfs.pubsub.unsubscribe.mockClear();
    ipfs.pubsub.publish.mockClear();

    const levelPath = await tmp.tmpName();
    const stateStore = new LevelStateStore(levelPath);
    stateStore.open('test');
    repository = new Repository(100, 100, loggerProvider.getDiagnosticsLogger());
    const pinStore = ({
      stateStore,
    } as unknown) as PinStore;
    repository.setDeps({pinStore} as unknown as RepositoryDependencies);
    dispatcher = new Dispatcher(
      ipfs,
      TOPIC,
      repository,
      loggerProvider.getDiagnosticsLogger(),
      loggerProvider.makeServiceLogger('pubsub'),
    );
  });

  afterEach(async () => {
    await dispatcher.close();
  });

  it('is constructed correctly', async () => {
    expect((dispatcher as any).repository).toBeInstanceOf(Repository);
    await delay(100); // Wait for plumbing
    expect(ipfs.pubsub.subscribe).toHaveBeenCalledWith(TOPIC, expect.anything());
  });

  it('closes correctly', async () => {
    await dispatcher.close();
    expect(ipfs.pubsub.unsubscribe).toHaveBeenCalledTimes(1);
    expect(ipfs.pubsub.unsubscribe).toHaveBeenCalledWith(TOPIC, expect.anything());
  });

  it('store record correctly', async () => {
    expect(await dispatcher.storeCommit('data')).toEqual(FAKE_CID);
  });

  it('retrieves record correctly', async () => {
    expect(await dispatcher.retrieveCommit(FAKE_CID)).toEqual('data');
  });

  it('publishes tip correctly', async () => {
    const tip = new CID('QmSnuWmxptJZdLJpKRarxBMS2Ju2oANVrgbr2xWbie9b2D');
    // Test if subscription ends. It always will, but better be on the safe side.
    await new Promise<void>((resolve) => {
      const subscription = dispatcher.publishTip(FAKE_DOC_ID, tip);
      subscription.add(() => {
        // Could be delay, but this is faster
        resolve();
      });
    });
    expect(ipfs.pubsub.publish).toHaveBeenCalledWith(
      TOPIC,
      serialize({ typ: MsgType.UPDATE, doc: FAKE_DOC_ID, tip: tip }),
    );
  });

  it('errors on invalid message type', async () => {
    const message = { typ: -1, id: '/ceramic/bagjqcgzaday6dzalvmy5ady2m5a5legq5zrbsnlxfc2bfxej532ds7htpova' };
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    await expect(dispatcher.handleMessage(message)).rejects.toThrow(/Unsupported message type/);
  });

  it('handle message correctly', async () => {
    dispatcher.repository.stateManager = {} as unknown as StateManager

    async function register(state: DocState) {
      const runningState = new RunningState(state);
      repository.add(runningState);
      dispatcher.messageBus.queryNetwork(runningState.id).subscribe();
      return runningState;
    }

    const initialState = ({
      doctype: 'tile',
      log: [
        {
          cid: FAKE_DOC_ID.cid,
          type: CommitType.GENESIS,
        },
      ],
    } as unknown) as DocState;
    const state$ = await register(initialState);

    // Store the query ID sent when the doc is registered so we can use it as the response ID later
    const publishArgs = ipfs.pubsub.publish.mock.calls[0];
    expect(publishArgs[0]).toEqual(TOPIC);
    const queryMessageSent = JSON.parse(publishArgs[1]);
    const queryID = queryMessageSent.id;

    // Handle UPDATE message
    dispatcher.repository.stateManager.update = jest.fn()
    await dispatcher.handleMessage({ typ: MsgType.UPDATE, doc: FAKE_DOC_ID, tip: FAKE_CID });
    expect(dispatcher.repository.stateManager.update).toBeCalledWith(state$.id, FAKE_CID);

    const continuationState = ({
      ...initialState,
      log: initialState.log.concat({
        cid: FAKE_CID,
        type: CommitType.SIGNED,
      }),
    } as unknown) as DocState;
    const doc2 = await register(continuationState);
    await dispatcher.handleMessage({ typ: MsgType.QUERY, doc: FAKE_DOC_ID, id: '1' });
    expect(ipfs.pubsub.publish).lastCalledWith(
      TOPIC,
      serialize({ typ: MsgType.RESPONSE, id: '1', tips: new Map().set(FAKE_DOC_ID.toString(), FAKE_CID) }),
    );

    // Handle RESPONSE message
    const tips = new Map().set(FAKE_DOC_ID.toString(), FAKE_CID2);
    await dispatcher.handleMessage({ typ: MsgType.RESPONSE, id: queryID, tips: tips });
    expect(dispatcher.repository.stateManager.update).toBeCalledWith(doc2.id, FAKE_CID2);
  });
});
