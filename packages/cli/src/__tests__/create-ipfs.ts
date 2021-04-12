import dagJose from 'dag-jose';
import { sha256 } from 'multiformats/hashes/sha2';
import legacy from 'multiformats/legacy';
import IPFS from 'ipfs-core';
import { AnchorStatus, CeramicApi, Doctype, DoctypeUtils, IpfsApi } from '@ceramicnetwork/common';

/**
 * Create an IPFS instance
 * @param overrideConfig - IFPS config for override
 */
export function createIPFS(overrideConfig: Record<string, unknown> = {}): Promise<IpfsApi> {
  const hasher = {};
  hasher[sha256.code] = sha256;
  const format = legacy(dagJose, { hashes: hasher });

  const config = {
    ipld: { formats: [format] },
  };

  Object.assign(config, overrideConfig);
  // @ts-ignore
  return IPFS.create(config);
}
