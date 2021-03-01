import { Repository } from './repository';
import { DocID } from '@ceramicnetwork/docid';
import { Document } from './document';
import { HandlersMap } from './handlers-map';
import { Context, DocOpts } from '@ceramicnetwork/common';
import { validateState } from './validate-state';
import { Dispatcher } from './dispatcher';
import { PinStore } from './store/pin-store';
import { DiagnosticsLogger } from '@ceramicnetwork/logger';

// DocOpts defaults for document load operations
export const DEFAULT_LOAD_DOCOPTS = {anchor: false, publish: false, sync: true}
// DocOpts defaults for document write operations
export const DEFAULT_WRITE_DOCOPTS = {anchor: true, publish: true, sync: false}

export class LoadingQueue {
  constructor(
    private readonly repository: Repository,
    private readonly dispatcher: Dispatcher,
    private readonly handlers: HandlersMap,
    private readonly context: Context,
    private readonly pinStore: PinStore,
    private readonly logger: DiagnosticsLogger,
    private readonly validateDocs: boolean,
  ) {}

  async load(docId: DocID, opts: DocOpts = {}) {
    const found = await this.repository.get(docId);
    if (found) {
      this.logger.verbose(`Document ${docId.toString()} loaded from cache`)
      return found;
    } else {
      // Load the current version of the document
      const handler = this.handlers.get(docId.typeName);
      opts = { ...DEFAULT_LOAD_DOCOPTS, ...opts };
      const genesisCid = docId.cid;
      const commit = await this.dispatcher.retrieveCommit(genesisCid);
      if (commit == null) {
        throw new Error(`No genesis commit found with CID ${genesisCid.toString()}`);
      }
      const state = await handler.applyCommit(commit, docId.cid, this.context);
      const validate = this.validateDocs;
      const document = new Document(state, this.dispatcher, this.pinStore, validate, this.context, handler);
      if (validate) {
        await validateState(document.state, document.content, this.context.api);
      }
      await this.repository.add(document);
      await document._syncDocumentToCurrent(this.pinStore, opts);
      this.logger.verbose(`Document ${docId.toString()} successfully loaded`)
      return document;
    }
  }
}
