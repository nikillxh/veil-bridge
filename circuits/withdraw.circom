pragma circom 2.1.6;

include "commitment.circom";
include "merkleTree.circom";

// The shielded-claim circuit, generated client-side by the claimer's fresh
// QIE wallet. It proves:
//   1. Knowledge of (nullifier, secret) whose commitment is a leaf of the tree
//      with the publicly known `root` (one of the roots bridged to QIE).
//   2. The revealed `nullifierHash` corresponds to that nullifier.
//
// `recipient`, `relayer`, `fee` and `refund` are public inputs that are bound
// into the proof (anti-malleability) so a relayer cannot redirect funds.
template Withdraw(levels) {
    signal input root;
    signal input nullifierHash;
    signal input recipient;   // not used in any computation, anchors the proof
    signal input relayer;     // not used in any computation, anchors the proof
    signal input fee;         // not used in any computation, anchors the proof
    signal input refund;      // not used in any computation, anchors the proof
    signal input nullifier;
    signal input secret;
    signal input pathElements[levels];
    signal input pathIndices[levels];

    component hasher = CommitmentHasher();
    hasher.nullifier <== nullifier;
    hasher.secret <== secret;
    hasher.nullifierHash === nullifierHash;

    component tree = MerkleTreeChecker(levels);
    tree.leaf <== hasher.commitment;
    tree.root <== root;
    for (var i = 0; i < levels; i++) {
        tree.pathElements[i] <== pathElements[i];
        tree.pathIndices[i] <== pathIndices[i];
    }

    // Add constraints binding the public signals so they can't be tampered
    // with while keeping a valid proof. (squares are cheap and unforgeable)
    signal recipientSquare;
    signal feeSquare;
    signal relayerSquare;
    signal refundSquare;
    recipientSquare <== recipient * recipient;
    feeSquare <== fee * fee;
    relayerSquare <== relayer * relayer;
    refundSquare <== refund * refund;
}

component main {public [root, nullifierHash, recipient, relayer, fee, refund]} = Withdraw(20);
