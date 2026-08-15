// api.ts carries the zod schemas that consumers use for request/response
// validation (Body / Response objects). The types/ folder also generates
// TS types with the same names — those would collide on re-export, and
// they aren't needed here anyway: TS types for API payloads are consumed
// from @workspace/api-client-react. If a caller of this package needs a
// type, they can derive it inline with `z.infer<typeof GetDashboardResponse>`.
export * from "./generated/api";
