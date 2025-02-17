import Level from "level-ts";
import { DocState, DocStateHolder, StreamUtils } from '@ceramicnetwork/common';
import { StateStore } from "./state-store"
import StreamID from '@ceramicnetwork/streamid'
import * as fs from 'fs'
import path from "path";

/**
 * Ceramic store for saving document state to a local leveldb instance
 */
export class LevelStateStore implements StateStore {
    #store: Level

    constructor(private storeRoot: string) {
    }

    /**
     * Gets internal db
     */
    get store(): Level {
        return this.#store
    }

    /**
     * Open pinning service
     */
    open(networkName: string): void {
        // Always store the pinning state in a network-specific directory
        const storePath = path.join(this.storeRoot, networkName)
        if (!!fs) {
            fs.mkdirSync(storePath, { recursive: true }) // create dir if it doesn't exist
        }
        this.#store = new Level(storePath);
    }

    /**
     * Pin document
     * @param docStateHolder - Document instance
     */
    async save(docStateHolder: DocStateHolder): Promise<void> {
        await this.#store.put(docStateHolder.id.toString(), StreamUtils.serializeState(docStateHolder.state))
    }

    /**
     * Load document state
     * @param streamId - Document ID
     */
    async load(streamId: StreamID): Promise<DocState> {
        try {
            const state = await this.#store.get(streamId.baseID.toString())
            if (state) {
                return StreamUtils.deserializeState(state);
            } else {
                return null;
            }
        } catch (err) {
            if (err.notFound) {
                return null; // return null for non-existent entry
            }
            throw err;
        }
    }

    /**
     * Unpin document
     * @param streamId - Document ID
     */
    async remove(streamId: StreamID): Promise<void> {
        await this.#store.del(streamId.baseID.toString())
    }

    /**
     * List pinned document
     * @param streamId - Document ID
     */
    async list(streamId?: StreamID): Promise<string[]> {
        let streamIds: string[]
        if (streamId == null) {
            return this.#store.stream({ keys: true, values: false })
        } else {
            const exists = Boolean(await this.load(streamId.baseID))
            streamIds = exists ? [streamId.toString()] : []
        }
        return streamIds
    }

    /**
     * Close pinning service
     */
    async close(): Promise<void> {
        // Do Nothing
    }
}
