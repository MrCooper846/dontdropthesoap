import type { YardSnapshot } from "../../domain/yard/yard";
import type { Settings } from "../../domain/match/model";
export type CircleView = {
  id: string;
  name: string;
  x: number;
  y: number;
  radius: number;
  mode: string;
  matchId: string | null;
  phase: string;
  seatCount: number;
  settings: Settings;
};
export type YardView = YardSnapshot & {
  serverTime: number;
  circles: CircleView[];
};
export type ChatMessage = {
  id: string;
  ownerId: string;
  name: string;
  text: string;
  sentAt: number;
};
export type Invitation = {
  id: string;
  creator_id: string;
  target_id: string;
  creator_name: string;
  target_name: string;
  circle_id: string;
  expires_at: string;
  status: string;
  match_id: string | null;
};
export type BrowserSession = {
  ownerId: string;
  name: string;
  controllerEpoch: number;
  csrfToken: string;
  features: {
    externalBots: boolean;
    yard: boolean;
    voice: boolean;
    visualBots: boolean;
    league?: boolean;
  };
};
