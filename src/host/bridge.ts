// The ONLY module that imports the Circles Mini App SDK. Everything else in the
// app depends on this bridge, never on the SDK directly — which keeps the domain
// logic testable in plain Node and lets the host be stubbed in tests.
import {
  isMiniappMode,
  onWalletChange,
  requestCreateAccount,
  sendTransactions,
  signMessage,
  onAppData,
  type Transaction,
  type SignatureType,
  type AuthResult,
} from '@aboutcircles/miniapp-sdk';

export {
  isMiniappMode,
  onWalletChange,
  requestCreateAccount,
  sendTransactions,
  signMessage,
  onAppData,
};

export type { Transaction, SignatureType, AuthResult };
