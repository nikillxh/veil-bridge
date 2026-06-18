import { poseidon, ZERO_VALUE } from "./poseidon";

export interface MerkleProof {
  root: bigint;
  pathElements: bigint[];
  pathIndices: number[];
}

/// Browser mirror of the on chain MerkleTreeWithHistory (same ZERO_VALUE, same
/// Poseidon, same ordering) so a client computed path verifies in the circuit.
export class PoseidonMerkleTree {
  readonly levels: number;
  private leaves: bigint[];
  private zeros: bigint[] = [];
  private layers: bigint[][] = [];
  root: bigint = 0n;

  private constructor(levels: number, leaves: bigint[]) {
    this.levels = levels;
    this.leaves = leaves;
  }

  static async create(levels: number, leaves: bigint[] = []): Promise<PoseidonMerkleTree> {
    const tree = new PoseidonMerkleTree(levels, leaves.slice());
    await tree.build();
    return tree;
  }

  private async build(): Promise<void> {
    this.zeros = [ZERO_VALUE];
    for (let i = 1; i <= this.levels; i++) {
      this.zeros[i] = await poseidon([this.zeros[i - 1], this.zeros[i - 1]]);
    }

    this.layers = [this.leaves.slice()];
    let current = this.leaves.slice();
    for (let level = 0; level < this.levels; level++) {
      const next: bigint[] = [];
      const len = Math.max(current.length, 1);
      for (let i = 0; i < len; i += 2) {
        const left = current[i] ?? this.zeros[level];
        const right = current[i + 1] ?? this.zeros[level];
        next.push(await poseidon([left, right]));
      }
      this.layers.push(next);
      current = next;
    }
    this.root = this.layers[this.levels][0] ?? this.zeros[this.levels];
  }

  indexOf(leaf: bigint): number {
    return this.leaves.findIndex((l) => l === leaf);
  }

  proof(index: number): MerkleProof {
    if (index < 0 || index >= this.leaves.length) {
      throw new Error(`Leaf index ${index} out of range`);
    }
    const pathElements: bigint[] = [];
    const pathIndices: number[] = [];
    let idx = index;
    for (let level = 0; level < this.levels; level++) {
      const layer = this.layers[level];
      const sibling = layer[idx ^ 1] ?? this.zeros[level];
      pathElements.push(sibling);
      pathIndices.push(idx & 1);
      idx = idx >> 1;
    }
    return { root: this.root, pathElements, pathIndices };
  }
}
