// AIOSpark Central DataAdapter Registry (Layer 5)

import { DataAdapter } from "./types";
import { CSVAdapter } from "./csv";
import { ZohoBooksAdapter } from "./zoho";
import { TallyAdapter } from "./tally";
import { BankAdapter } from "./bank";

class AdapterRegistry {
  private adapters: Map<string, DataAdapter> = new Map();

  constructor() {
    // Register standard adapters
    this.registerAdapter(new CSVAdapter());
    this.registerAdapter(new ZohoBooksAdapter());
    this.registerAdapter(new TallyAdapter());
    this.registerAdapter(new BankAdapter());
  }

  public registerAdapter(adapter: DataAdapter): void {
    this.adapters.set(adapter.adapterType, adapter);
  }

  public getAdapter(adapterType: string): DataAdapter {
    const adapter = this.adapters.get(adapterType);
    if (!adapter) {
      throw new Error(`Unsupported DataAdapter type: '${adapterType}'. Supported types: ${Array.from(this.adapters.keys()).join(", ")}`);
    }
    return adapter;
  }

  public getRegisteredAdapterTypes(): string[] {
    return Array.from(this.adapters.keys());
  }
}

export const adapterRegistry = new AdapterRegistry();
