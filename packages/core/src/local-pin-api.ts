import { DocStateHolder, PinApi } from '@ceramicnetwork/common';
import DocID from '@ceramicnetwork/docid';
import { PinStore } from './store/pin-store';
import { DiagnosticsLogger } from "@ceramicnetwork/logger";

/**
 * PinApi for Ceramic core.
 */
export class LocalPinApi implements PinApi {
  constructor(
    private readonly pinStore: PinStore,
    private readonly loadDoc: (docId: DocID) => Promise<DocStateHolder>,
    private readonly logger: DiagnosticsLogger,
  ) {}

  async add(docId: DocID): Promise<void> {
    const document = await this.loadDoc(docId);
    await this.pinStore.add(document);
    this.logger.verbose(`Pinned document ${docId.toString()}`)
  }

  async rm(docId: DocID): Promise<void> {
    await this.pinStore.rm(docId);
    this.logger.verbose(`Unpinned document ${docId.toString()}`)
  }

  async ls(docId?: DocID): Promise<AsyncIterable<string>> {
    const docIds = await this.pinStore.ls(docId ? docId.baseID : null);
    return {
      [Symbol.asyncIterator](): any {
        let index = 0;
        return {
          next(): any {
            if (index === docIds.length) {
              return Promise.resolve({ value: null, done: true });
            }
            return Promise.resolve({ value: docIds[index++], done: false });
          },
        };
      },
    };
  }
}
