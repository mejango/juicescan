import { describe, expect, it } from 'vitest';
import { exactProjectRefsWhere } from '../src/discover.js';

describe('indexer filter for a batch of projects', () => {
  // The indexer reads `{ chainId, projectId }` inside OR as "this chain or this id", which returns other projects
  // and, under the batch's limit, can leave the wanted one out.
  it('wraps each project in its own AND so only the exact chain and id match', () => {
    expect(exactProjectRefsWhere([{ chainId: 8453, projectId: 3 }, { chainId: '1', projectId: '5' }])).toEqual({
      version: 6,
      OR: [
        { AND: [{ chainId: 8453 }, { projectId: 3 }] },
        { AND: [{ chainId: 1 }, { projectId: 5 }] },
      ],
    });
  });
});
