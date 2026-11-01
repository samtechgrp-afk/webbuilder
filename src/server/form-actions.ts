"use server";

import type { SubmissionStatus } from "@prisma/client";
import { getTenant } from "@/lib/tenant";
import { run } from "./action-result";
import { deleteSubmission, deleteSubscriber, setSubmissionStatus, setSubscriberStatus } from "./forms/admin-service";

/** Server actions for the Forms inbox and subscribers. The services check `forms.manage`. */

type WithSite<T> = T & { siteId: string };

export async function setSubmissionStatusAction(input: WithSite<{ id: string; status: SubmissionStatus }>) {
  return run(async () => setSubmissionStatus(await getTenant(input.siteId), input.id, input.status));
}
export async function deleteSubmissionAction(input: WithSite<{ id: string }>) {
  return run(async () => deleteSubmission(await getTenant(input.siteId), input.id));
}
export async function setSubscriberStatusAction(input: WithSite<{ id: string; subscribed: boolean }>) {
  return run(async () => setSubscriberStatus(await getTenant(input.siteId), input.id, input.subscribed));
}
export async function deleteSubscriberAction(input: WithSite<{ id: string }>) {
  return run(async () => deleteSubscriber(await getTenant(input.siteId), input.id));
}
