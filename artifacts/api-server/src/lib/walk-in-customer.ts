import { eq } from "drizzle-orm";
import { db, customersTable } from "@workspace/db";

export const WALK_IN_CUSTOMER_NAME = "Walk-in Customer";

/** Ensures every walk-in sale can be linked to a real customer row in the database. */
export async function getOrCreateWalkInCustomerId(): Promise<number> {
  const [existing] = await db
    .select({ id: customersTable.id })
    .from(customersTable)
    .where(eq(customersTable.name, WALK_IN_CUSTOMER_NAME))
    .limit(1);

  if (existing) return existing.id;

  const [created] = await db
    .insert(customersTable)
    .values({ name: WALK_IN_CUSTOMER_NAME, accountType: "cash" })
    .returning({ id: customersTable.id });

  return created!.id;
}
