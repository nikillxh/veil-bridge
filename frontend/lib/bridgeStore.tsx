"use client";

import {
  createContext,
  useContext,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";
import type { Step } from "@/components/Stepper";
import type { Note } from "./note";

export interface DepositState {
  busy: boolean;
  notes: Note[];
  error: string | null;
  steps: Step[];
  txHash: string | null;
  showSuccess: boolean;
}

export interface ClaimState {
  noteInput: string;
  busy: boolean;
  error: string | null;
  steps: Step[];
  done: string | null;
  showSuccess: boolean;
}

const depositInit: DepositState = {
  busy: false,
  notes: [],
  error: null,
  steps: [],
  txHash: null,
  showSuccess: false,
};

const claimInit: ClaimState = {
  noteInput: "",
  busy: false,
  error: null,
  steps: [],
  done: null,
  showSuccess: false,
};

interface BridgeCtx {
  deposit: DepositState;
  setDeposit: Dispatch<SetStateAction<DepositState>>;
  claim: ClaimState;
  setClaim: Dispatch<SetStateAction<ClaimState>>;
}

const Ctx = createContext<BridgeCtx | null>(null);

/// Holds the deposit + claim flow state. Mounted above the router (in Providers)
/// so navigating between the Deposit and Claim tabs does not unmount it and the
/// in-progress steps, generated note, and results survive tab switches.
export function BridgeProvider({ children }: { children: ReactNode }) {
  const [deposit, setDeposit] = useState<DepositState>(depositInit);
  const [claim, setClaim] = useState<ClaimState>(claimInit);
  return (
    <Ctx.Provider value={{ deposit, setDeposit, claim, setClaim }}>{children}</Ctx.Provider>
  );
}

export function useBridge(): BridgeCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error("useBridge must be used within BridgeProvider");
  return v;
}
