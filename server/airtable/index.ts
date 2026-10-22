/**
 * Airtable table clients.
 *
 * Add a table to `TABLES` in scripts/generate-airtable-schema.ts, re-run
 * `npm run schema:generate`, then export it here.
 */
import { defineTable } from '../lib/airtable';
import {
  FieldOpsEml20Table,
  ReadinessEventTable,
  NhWoExperienceTable,
  FsmProgressCheckInTable,
  LicensingTable,
  RequiredCoursesTable,
  type FieldOpsEml20RecordType,
  type ReadinessEventRecordType,
  type NhWoExperienceRecordType,
  type FsmProgressCheckInRecordType,
  type LicensingRecordType,
  type RequiredCoursesRecordType,
} from './schema.generated';

export const FieldOpsEml20 = defineTable<FieldOpsEml20RecordType>(FieldOpsEml20Table);
export const ReadinessEvent = defineTable<ReadinessEventRecordType>(ReadinessEventTable);
export const NhWoExperience = defineTable<NhWoExperienceRecordType>(NhWoExperienceTable);
export const FsmProgressCheckIn = defineTable<FsmProgressCheckInRecordType>(FsmProgressCheckInTable);
export const Licensing = defineTable<LicensingRecordType>(LicensingTable);
export const RequiredCourses = defineTable<RequiredCoursesRecordType>(RequiredCoursesTable);

export type {
  FieldOpsEml20RecordType,
  ReadinessEventRecordType,
  NhWoExperienceRecordType,
  FsmProgressCheckInRecordType,
  LicensingRecordType,
  RequiredCoursesRecordType,
};
