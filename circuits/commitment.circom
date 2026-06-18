pragma circom 2.1.6;

include "circomlib/circuits/poseidon.circom";

// Computes the deposit commitment and the nullifier hash used at withdraw time.
//   commitment    = Poseidon(nullifier, secret)
//   nullifierHash = Poseidon(nullifier)
//
// The commitment is the leaf inserted into the source-chain Merkle tree.
// The nullifierHash is revealed on QIE to prevent double-spending without
// linking back to the original depositor.
template CommitmentHasher() {
    signal input nullifier;
    signal input secret;
    signal output commitment;
    signal output nullifierHash;

    component commitmentHasher = Poseidon(2);
    component nullifierHasher = Poseidon(1);

    commitmentHasher.inputs[0] <== nullifier;
    commitmentHasher.inputs[1] <== secret;

    nullifierHasher.inputs[0] <== nullifier;

    commitment <== commitmentHasher.out;
    nullifierHash <== nullifierHasher.out;
}
