import { z } from "zod";
import {
  CreateBillInput,
  ReimbursementStatus,
  type UpdateBillInput,
} from "../../../contracts/bill";

// Controlled fields need an explicit empty value, not undefined.
export const BillFormSchema = z
  .object({
    ...CreateBillInput.shape,
    reimbursementStatus: ReimbursementStatus.nullish(),
  })
  .refine(input => !input.isAmortized || !!input.amortizationMonths, {
    path: ["amortizationMonths"],
    message: "请填写摊销时长",
  });

export type BillFormValues = z.infer<typeof BillFormSchema>;

export function getBillUpdateInput(
  id: string,
  values: BillFormValues
): UpdateBillInput {
  return {
    ...values,
    id,
    reimbursementStatus: values.reimbursementStatus ?? null,
    reimbursementParty: values.reimbursementStatus
      ? values.reimbursementParty
      : null,
  };
}
