import getPort from 'get-port';
import { IpfsApi, LogLevel } from '@ceramicnetwork/common';
import * as tmp from 'tmp-promise';
import { createIPFS } from './create-ipfs';
import Ceramic from '@ceramicnetwork/core';
import * as random from '@stablelib/random';
import CeramicDaemon, { makeCeramicConfig } from '../ceramic-daemon';
import CeramicClient from '@ceramicnetwork/http-client';
import { makeDID } from './make-did';
import { TileDoctype } from '@ceramicnetwork/doctype-tile';
import { LogToFiles } from '../ceramic-logger-plugins';
import * as path from 'path';
import * as fs from 'fs';

const TOPIC = `/${random.randomString(10)}`;
const SEED = 'Hello, crypto!';

let ipfs: IpfsApi;
let core: Ceramic;
let client: CeramicClient;
let daemon: CeramicDaemon;
let tmpFolder: tmp.DirectoryResult;

function safeRead(filepath: string): string {
  if (fs.existsSync(filepath)) {
    return fs.readFileSync(filepath).toString();
  } else {
    return '';
  }
}

beforeAll(async () => {
  tmpFolder = await tmp.dir({ unsafeCleanup: true });
  const ipfsPort = await getPort();
  ipfs = await createIPFS({
    repo: `${tmpFolder.path}/ipfs${ipfsPort}/`,
    config: {
      Addresses: { Swarm: [`/ip4/127.0.0.1/tcp/${ipfsPort}`] },
      Discovery: {
        MDNS: { Enabled: false },
        webRTCStar: { Enabled: false },
      },
      Bootstrap: [],
    },
  });
  const stateStoreDirectory = tmpFolder.path;
  core = await Ceramic.create(
    ipfs,
    makeCeramicConfig({
      pubsubTopic: TOPIC,
      stateStoreDirectory,
      // @ts-ignore
      anchorOnRequest: false,
      loggerConfig: {
        logToFiles: true,
        logDirectory: `${stateStoreDirectory}`,
        logLevel: LogLevel.debug,
      },
    }),
  );
  const daemonPort = await getPort();
  daemon = new CeramicDaemon(core, {
    port: daemonPort,
    corsAllowedOrigins: [/.*/],
    loggerConfig: {
      logToFiles: true,
      logDirectory: `${stateStoreDirectory}`,
      logLevel: LogLevel.debug,
    },
  });
  await daemon.listen();
  const apiUrl = `http://localhost:${daemonPort}`;
  client = new CeramicClient(apiUrl, { docSyncInterval: 500 });

  await core.setDID(makeDID(core));
  await client.setDID(makeDID(client, SEED));
});

afterAll(async () => {
  await client.close();
  await daemon.close();
  await core.close();
  await ipfs.stop();
  // await tmpFolder.cleanup();
});

test('write to http-access', async () => {
  await TileDoctype.create(client, { test: 123 }, null, { anchor: false, publish: false, sync: false });
  await new Promise((resolve) => setTimeout(resolve, 1000));
  const httpAccessLog = safeRead(path.resolve(tmpFolder.path, 'http-access.log'));
  const lines = httpAccessLog.split('\n');
  expect(lines.length).toEqual(3);
  expect(lines[0]).toContain('error_message=-');
  expect(lines[0]).toContain('error_code=-');
  expect(lines[0]).toContain('status=200');
});

test('write error to http access log', async () => {
  core.createDocumentFromGenesis = async () => {
    throw new Error(`BANG`);
  };
  await expect(TileDoctype.create(client, { test: 123 }, null, { anchor: false, publish: false, sync: false })).rejects.toThrow()
  await new Promise((resolve) => setTimeout(resolve, 300));
  const httpAccessLog = safeRead(path.resolve(tmpFolder.path, 'http-access.log')).toString();
  const lines = httpAccessLog.split('\n');
  expect(lines.length).toEqual(3);
  expect(lines[0]).toContain('error_message=BANG');
  expect(lines[0]).toContain('error_code=-');
  expect(lines[0]).toContain('status=500');
});

// test.todo('report error to diagnostics log');
