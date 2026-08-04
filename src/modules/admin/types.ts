import type {
  DouyinSyncResult,
  DouyinSyncRun,
  Talent,
  TalentDouyinAdminStatus,
  TalentTag
} from "@/modules/domain/types";

export interface BlockedBulkAction {
  id: string;
  reason: string;
}

export interface BulkActionResult {
  succeededIds: string[];
  blocked: BlockedBulkAction[];
}

export interface TalentBulkPayload {
  action: "add_tags" | "remove_tags" | "delete";
  ids: string[];
  tags?: TalentTag[];
}

export interface EventBulkPayload {
  action: "delete";
  ids: string[];
}

export interface TalentBulkResponse extends BulkActionResult {
  talents?: Talent[];
}

export interface DouyinSyncResponse {
  ok?: boolean;
  error?: string;
  code?: string;
  run?: DouyinSyncRun;
  results?: DouyinSyncResult[];
  statuses?: TalentDouyinAdminStatus[];
}
