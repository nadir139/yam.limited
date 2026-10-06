// Run with: deno test supabase/functions/agent/schedule_test.ts
import { computeSchedule, fromDay } from "./schedule.ts";
const wp = (id: string, ps: string | null, pe: string | null, extra: Record<string, unknown> = {}) => ({
  id, wp_number: id, title: id, discipline: "RIGGING", status: "DRAFT",
  planned_start: ps, planned_end: pe, actual_start: null, actual_end: null,
  baseline_start: null, baseline_end: null, ...extra,
});
function eq(a: unknown, b: unknown, msg: string) { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${msg}: got ${JSON.stringify(a)} want ${JSON.stringify(b)}`); }

Deno.test("FS chain pushes successor, critical path, float", () => {
  const r = computeSchedule({
    today: "2026-10-01",
    workPackages: [wp("A", "2026-10-13", "2026-10-17"), wp("B", "2026-10-13", "2026-10-14"), wp("C", "2026-10-13", "2026-10-13")],
    dependencies: [{ predecessor_id: "A", successor_id: "B", kind: "FS", lag_days: 0 }],
  });
  eq(fromDay(r.byId.B.forecastStart!), "2026-10-18", "B starts after A");
  eq(fromDay(r.byId.B.forecastEnd!), "2026-10-19", "B keeps 2-day duration");
  eq(r.byId.B.drivenBy, "A", "driver");
  eq([r.byId.A.critical, r.byId.B.critical, r.byId.C.critical], [true, true, false], "critical");
  eq(r.byId.C.floatDays, 6, "C float");
  eq(r.byId.B.slipDays, 5, "B slip vs planned");
});
Deno.test("SS with lag, change-order delay, late start, overdue, complete", () => {
  const r = computeSchedule({
    today: "2026-10-20",
    workPackages: [
      wp("A", "2026-10-21", "2026-10-25"),
      wp("B", "2026-10-21", "2026-10-22"),
      wp("L", "2026-10-10", "2026-10-12"),
      wp("O", "2026-10-10", "2026-10-12", { status: "ACTIVE", actual_start: "2026-10-10" }),
      wp("D", "2026-10-01", "2026-10-03", { status: "COMPLETE", actual_start: "2026-10-02", actual_end: "2026-10-05" }),
      wp("U", null, null),
    ],
    dependencies: [{ predecessor_id: "A", successor_id: "B", kind: "SS", lag_days: 2 }],
    delays: [{ work_package_id: "A", days: 3, source: "CO-2026-001", pending: true }],
  });
  eq(fromDay(r.byId.A.forecastEnd!), "2026-10-28", "A +3 days CO");
  eq(r.byId.A.awaitingApproval, true, "awaiting approval");
  eq(fromDay(r.byId.B.forecastStart!), "2026-10-23", "B SS+2");
  eq([r.byId.L.lateStart, fromDay(r.byId.L.forecastStart!), fromDay(r.byId.L.forecastEnd!)], [true, "2026-10-20", "2026-10-22"], "late start");
  eq([r.byId.O.overdue, fromDay(r.byId.O.forecastEnd!)], [true, "2026-10-20"], "overdue");
  eq([fromDay(r.byId.D.forecastEnd!), r.byId.D.critical], ["2026-10-05", false], "complete uses actual");
  eq(r.unscheduled, ["U"], "unscheduled");
  eq(fromDay(r.forecastFinish!), "2026-10-28", "finish");
});
