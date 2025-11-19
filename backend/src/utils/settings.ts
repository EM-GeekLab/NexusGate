import type { Static, TSchema } from "@sinclair/typebox";
import { Value } from "@sinclair/typebox/value";
import {
  deleteSetting as deleteSettingFromDb,
  getSetting as getSettingFromDb,
  upsertSetting,
} from "@/db";

export async function getSetting<T>(key: string, defaultVal: T): Promise<T> {
  const dbRecord = await getSettingFromDb(key);
  if (dbRecord) {
    return dbRecord.value as T;
  }
  return defaultVal;
}

export async function setSetting<T>(key: string, value: T): Promise<void> {
  await upsertSetting({
    key,
    value,
    updatedAt: new Date(),
  });
}

export async function deleteSetting(key: string): Promise<void> {
  await deleteSettingFromDb(key);
}

export async function getSettingChecked<T extends TSchema>(
  key: string,
  type_: T,
  defaultVal: Static<typeof type_>,
): Promise<Static<typeof type_>> {
  return Value.Parse(
    type_,
    await getSetting<Static<typeof type_>>(key, defaultVal),
  );
}
