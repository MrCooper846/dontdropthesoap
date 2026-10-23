export const RESTAURANT_ROLES = ["chef", "waiter", "barman", "runner"] as const;
export type RestaurantRole = (typeof RESTAURANT_ROLES)[number];
export const RESTAURANT_ZONES = [
  "dining",
  "kitchen",
  "bar",
  "washup",
  "stockroom",
  "office",
] as const;
export type RestaurantZone = (typeof RESTAURANT_ZONES)[number];
export type RestaurantAction =
  | { type: "join" }
  | { type: "role"; role: RestaurantRole }
  | { type: "ready"; ready: boolean }
  | { type: "start" }
  | { type: "move"; zone: RestaurantZone }
  | {
      type: "begin";
      kind: "cook" | "drink" | "serve" | "wash" | "restock";
      orderId?: string;
    }
  | { type: "step"; value: string }
  | { type: "cancel" }
  | { type: "deposit" }
  | { type: "steal"; amount: number }
  | { type: "take" }
  | { type: "return"; amount: number }
  | { type: "recover"; dropId: string }
  | { type: "reconcile" }
  | { type: "search"; targetId: string }
  | { type: "support" }
  | { type: "leave" };
export type RestaurantTaskView = {
  kind: "cook" | "drink" | "serve" | "wash" | "restock";
  orderId?: string;
  steps: string[];
  index: number;
  choices: string[];
  nextAt: number;
  expiresAt: number;
};
export type RestaurantOrder = {
  id: string;
  table: number;
  dish: string;
  drink: string;
  foodReady: boolean;
  drinkReady: boolean;
  createdAt: number;
  expiresAt: number;
  status: "open" | "served" | "expired";
  paid: number;
};
export type RestaurantCrewView = {
  id: string;
  name: string;
  role: RestaurantRole;
  zone: RestaurantZone;
  ready: boolean;
  active: boolean;
  caught: boolean;
  contribution: number;
};
export type RestaurantReceipt = {
  ownerId: string;
  name: string;
  base: number;
  penalty: number;
  redistribution: number;
  theft: number;
  total: number;
};
export type RestaurantView = {
  id: string;
  hostId: string;
  phase: "waiting" | "active" | "finished";
  version: number;
  serverTime: number;
  durationMs: number;
  startedAt: number | null;
  endsAt: number | null;
  stealEndsAt: number | null;
  vault: number;
  revenue: number;
  spent: number;
  cleanPlates: number;
  emergencyRestockAvailable: boolean;
  dirtyPlates: number;
  stock: number;
  served: number;
  crew: RestaurantCrewView[];
  orders: RestaurantOrder[];
  events: { id: number; at: number; text: string }[];
  drops: {
    id: string;
    zone: RestaurantZone;
    amount: number;
    expiresAt: number;
  }[];
  search: {
    callerId: string;
    targetId: string;
    supporters: string[];
    expiresAt: number;
    resolvesAt: number | null;
  } | null;
  searchCooldownUntil: number;
  lastReconciliation: { at: number; missing: number } | null;
  me: RestaurantCrewView & {
    pouch: number;
    stolen: number;
    canSteal: boolean;
    risk: "low" | "medium" | "high";
    task: RestaurantTaskView | null;
    pendingTheft: { amount: number; readyAt: number } | null;
    searchAvailableAt: number;
    falseAccusations: number;
  };
  receipts: RestaurantReceipt[] | null;
};
export type RestaurantLobby = {
  id: string;
  hostName: string;
  phase: "waiting" | "active" | "finished";
  players: number;
  durationMs: number;
  mine: boolean;
};

export type RestaurantObservation = Omit<RestaurantView, "me"> & {
  me: RestaurantView["me"] | null;
};
