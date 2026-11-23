// Gives the CRM logic (written for Node) the global Buffer it expects.
import { Buffer } from 'buffer';

if (!globalThis.Buffer) globalThis.Buffer = Buffer;
export { Buffer };
