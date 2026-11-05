import { DrizzleD1Database } from 'drizzle-orm/d1';
import { and, desc, eq, inArray } from 'drizzle-orm';
import * as schema from '../../db/schema';
import {
  cocoComplianceRecords,
  documents,
  municipalTaxDues,
  nfrLeases,
  nfrRentDues,
  nfrRentPayments,
  retailOutlets,
  users,
  utilityElectricityAccounts,
  utilityElectricityBills,
} from '../../db/schema';
import {
  buildDueDatesAndActionsSummary,
  CocoAttachmentInfo,
  CocoAuthoritativeSource,
  CocoComplianceMergedItem,
  CocoComplianceStatus,
  CocoDueDatesAndActionsSummary,
  CocoOnePagerReport,
  CocoPaymentStatus,
  CocoStatusYesNo,
  evaluateComplianceStatus,
  formatIndianCurrencyFromPaise,
  LinkedModuleSummary,
  STANDARD_CATEGORY_MAP,
  STANDARD_COCO_CATEGORIES,
  toCocoOnePagerRow,
} from '../../shared/cocoComplianceUtils';

export class CocoComplianceError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number = 400
  ) {
    super(message);
    this.name = 'CocoComplianceError';
  }
}

export interface UpsertCocoComplianceRecordInput {
  outletId: string;
  categoryCode: string;
  categoryName?: string;
  isCustomCategory?: boolean;
  documentTitle?: string | null;
  referenceNumber?: string | null;
  issueDate?: string | null;
  validityDueDate?: string | null;
  lastServiceDate?: string | null;
  amountPaise?: number | null;
  frequency?: string | null;
  paymentStatus?: CocoPaymentStatus;
  paymentDate?: string | null;
  complianceStatus?: CocoComplianceStatus;
  statusYesNo?: CocoStatusYesNo;
  remarks?: string | null;
  actionRequired?: string | null;
  responsiblePerson?: string | null;
  attachmentDocumentIds?: string[];
}

export class CocoComplianceService {
  constructor(private db: DrizzleD1Database<typeof schema>) {}

  private parseAttachmentIds(rawJson: string | null | undefined): string[] {
    if (!rawJson) return [];
    try {
      const parsed = JSON.parse(rawJson);
      if (Array.isArray(parsed)) {
        return parsed.filter((id): id is string => typeof id === 'string' && id.trim() !== '');
      }
      return [];
    } catch {
      return [];
    }
  }

  private async validateAttachmentIdsForOutlet(outletId: string, docIds: string[]): Promise<string[]> {
    const uniqueIds = Array.from(new Set(docIds.map((s) => s.trim()).filter(Boolean)));
    if (uniqueIds.length === 0) return [];

    const rows = await this.db
      .select({
        id: documents.id,
        outletId: documents.outletId,
      })
      .from(documents)
      .where(inArray(documents.id, uniqueIds))
      .all();

    if (rows.length !== uniqueIds.length) {
      throw new CocoComplianceError(
        'ATTACHMENT_NOT_FOUND',
        'One or more supporting attachment documents were not found in the Document Vault.',
        404
      );
    }

    for (const row of rows) {
      if (row.outletId !== outletId) {
        throw new CocoComplianceError(
          'ATTACHMENT_OUTLET_MISMATCH',
          `Attachment document ${row.id} belongs to a different outlet and cannot be linked.`,
          403
        );
      }
    }

    return uniqueIds;
  }

  /**
   * Fetches read-only linked module summaries for Property Tax, Water Bill, Lease Rent, and Electricity Bill.
   */
  private async loadLinkedModuleSummaries(
    outletId: string,
    reportDate: string
  ): Promise<Map<string, LinkedModuleSummary>> {
    const map = new Map<string, LinkedModuleSummary>();

    // 1. Municipal Tax Dues (Property Tax + Water Tax/Local Authority Due)
    const taxRows = await this.db
      .select()
      .from(municipalTaxDues)
      .where(eq(municipalTaxDues.outletId, outletId))
      .orderBy(desc(municipalTaxDues.dueDate), desc(municipalTaxDues.createdAt))
      .all();

    const propertyTaxRows = taxRows.filter((r) => r.taxType === 'PROPERTY_TAX');
    if (propertyTaxRows.length > 0) {
      const pendingRows = propertyTaxRows.filter((r) => r.status === 'PENDING');
      const primaryRow = pendingRows.length > 0 ? pendingRows[pendingRows.length - 1] : propertyTaxRows[0];
      const totalPendingPaise = pendingRows.reduce((acc, r) => acc + r.amountPaise, 0);
      const docIds = Array.from(
        new Set(
          propertyTaxRows
            .flatMap((r) => [r.assessmentDocumentId, r.paymentReceiptDocumentId])
            .filter((x): x is string => Boolean(x))
        )
      );
      const isPending = pendingRows.length > 0;
      const isOverdue = isPending && pendingRows.some((r) => r.dueDate < reportDate);
      const paymentStatus: CocoPaymentStatus = isOverdue
        ? 'OVERDUE'
        : isPending
        ? 'PENDING'
        : 'PAID';

      map.set('PROPERTY_TAX', {
        source: 'MUNICIPAL_TAX_MODULE',
        sourceLabel: 'Municipal Tax Management',
        recordCount: propertyTaxRows.length,
        referenceNumber: primaryRow.referenceNumber,
        dueDate: isPending ? primaryRow.dueDate : primaryRow.assessmentPeriodEnd || primaryRow.dueDate,
        amountPaise: isPending ? totalPendingPaise : primaryRow.amountPaise,
        frequency: primaryRow.assessmentFrequency === 'ANNUAL' ? 'Yearly' : 'Quarterly',
        paymentStatus,
        paidAt: primaryRow.paidAt ? primaryRow.paidAt.slice(0, 10) : null,
        documentIds: docIds,
        summaryText: isPending
          ? `${pendingRows.length} pending Property Tax assessment(s) (${primaryRow.authorityName})`
          : `Paid (${primaryRow.authorityName}, Period ending ${primaryRow.assessmentPeriodEnd})`,
      });
    }

    const waterTaxRows = taxRows.filter(
      (r) =>
        r.taxType === 'LOCAL_AUTHORITY_DUE' &&
        (/water/i.test(r.authorityName) ||
          /water/i.test(r.referenceNumber) ||
          /water/i.test(r.notes || ''))
    );
    if (waterTaxRows.length > 0) {
      const pendingWater = waterTaxRows.filter((r) => r.status === 'PENDING');
      const primaryWater = pendingWater.length > 0 ? pendingWater[pendingWater.length - 1] : waterTaxRows[0];
      const totalPendingPaise = pendingWater.reduce((acc, r) => acc + r.amountPaise, 0);
      const docIds = Array.from(
        new Set(
          waterTaxRows
            .flatMap((r) => [r.assessmentDocumentId, r.paymentReceiptDocumentId])
            .filter((x): x is string => Boolean(x))
        )
      );
      const isPending = pendingWater.length > 0;
      const isOverdue = isPending && pendingWater.some((r) => r.dueDate < reportDate);

      map.set('WATER_BILL', {
        source: 'MUNICIPAL_TAX_MODULE',
        sourceLabel: 'Municipal / Utility Water Dues',
        recordCount: waterTaxRows.length,
        referenceNumber: primaryWater.referenceNumber,
        dueDate: isPending ? primaryWater.dueDate : primaryWater.assessmentPeriodEnd || primaryWater.dueDate,
        amountPaise: isPending ? totalPendingPaise : primaryWater.amountPaise,
        frequency: primaryWater.assessmentFrequency === 'ANNUAL' ? 'Yearly' : 'Quarterly',
        paymentStatus: isOverdue ? 'OVERDUE' : isPending ? 'PENDING' : 'PAID',
        paidAt: primaryWater.paidAt ? primaryWater.paidAt.slice(0, 10) : null,
        documentIds: docIds,
        summaryText: isPending
          ? `${pendingWater.length} pending Water bill/tax due(s) (${primaryWater.authorityName})`
          : `Paid (${primaryWater.authorityName})`,
      });
    }

    // 2. NFR Lease & Rent Management (LEASE_RENT)
    const leases = await this.db
      .select()
      .from(nfrLeases)
      .where(eq(nfrLeases.outletId, outletId))
      .orderBy(desc(nfrLeases.leaseEndDate))
      .all();

    const rentDues = await this.db
      .select()
      .from(nfrRentDues)
      .where(eq(nfrRentDues.outletId, outletId))
      .orderBy(desc(nfrRentDues.dueDate))
      .all();

    const rentPayments = await this.db
      .select()
      .from(nfrRentPayments)
      .where(eq(nfrRentPayments.outletId, outletId))
      .orderBy(desc(nfrRentPayments.paidAt))
      .all();

    if (leases.length > 0 || rentDues.length > 0) {
      const paidByDueId = new Map<string, number>();
      const latestPaidDateByDueId = new Map<string, string>();
      for (const p of rentPayments) {
        paidByDueId.set(p.rentDueId, (paidByDueId.get(p.rentDueId) || 0) + p.amountPaise);
        if (!latestPaidDateByDueId.has(p.rentDueId)) {
          latestPaidDateByDueId.set(p.rentDueId, p.paidAt.slice(0, 10));
        }
      }

      const unpaidDues = rentDues.filter(
        (d) => (paidByDueId.get(d.id) || 0) < d.monthlyRentPaiseSnapshot
      );
      const activeLeases = leases.filter((l) => l.status === 'ACTIVE');
      const primaryLease = activeLeases[0] || leases[0];
      const docIds = Array.from(
        new Set([
          ...leases.map((l) => l.agreementDocumentId).filter((x): x is string => Boolean(x)),
          ...rentPayments.map((p) => p.receiptDocumentId).filter((x): x is string => Boolean(x)),
        ])
      );

      if (unpaidDues.length > 0) {
        const totalOutstandingPaise = unpaidDues.reduce(
          (acc, d) => acc + Math.max(0, d.monthlyRentPaiseSnapshot - (paidByDueId.get(d.id) || 0)),
          0
        );
        const earliestUnpaid = unpaidDues[unpaidDues.length - 1];
        const isOverdue = unpaidDues.some((d) => d.dueDate < reportDate);
        map.set('LEASE_RENT', {
          source: 'NFR_LEASE_RENT_MODULE',
          sourceLabel: 'NFR Lease & Rent Management',
          recordCount: rentDues.length || leases.length,
          referenceNumber: primaryLease ? primaryLease.agreementNumber : earliestUnpaid.billingMonth,
          dueDate: earliestUnpaid.dueDate,
          amountPaise: totalOutstandingPaise,
          frequency: 'Monthly',
          paymentStatus: isOverdue ? 'OVERDUE' : 'PENDING',
          paidAt: null,
          documentIds: docIds,
          summaryText: `${unpaidDues.length} unpaid rent due(s) (${earliestUnpaid.billingMonth})`,
        });
      } else if (rentDues.length > 0) {
        const latestDue = rentDues[0];
        map.set('LEASE_RENT', {
          source: 'NFR_LEASE_RENT_MODULE',
          sourceLabel: 'NFR Lease & Rent Management',
          recordCount: rentDues.length,
          referenceNumber: primaryLease ? primaryLease.agreementNumber : latestDue.billingMonth,
          dueDate: primaryLease ? primaryLease.leaseEndDate : latestDue.dueDate,
          amountPaise: latestDue.monthlyRentPaiseSnapshot,
          frequency: 'Monthly',
          paymentStatus: 'PAID',
          paidAt: latestPaidDateByDueId.get(latestDue.id) || null,
          documentIds: docIds,
          summaryText: `Rent Paid for ${latestDue.billingMonth}${primaryLease ? ` (Agreement ${primaryLease.agreementNumber})` : ''}`,
        });
      } else if (primaryLease) {
        map.set('LEASE_RENT', {
          source: 'NFR_LEASE_RENT_MODULE',
          sourceLabel: 'NFR Lease & Rent Management',
          recordCount: leases.length,
          referenceNumber: primaryLease.agreementNumber,
          dueDate: primaryLease.leaseEndDate,
          amountPaise: primaryLease.monthlyRentPaise,
          frequency: 'Monthly',
          paymentStatus: 'NOT_RECORDED',
          paidAt: null,
          documentIds: docIds,
          summaryText: `Lease Agreement ${primaryLease.agreementNumber} (${primaryLease.status})`,
        });
      }
    }

    // 3. Utility Electricity Bills (ELECTRICITY_BILL)
    const elecBills = await this.db
      .select()
      .from(utilityElectricityBills)
      .where(eq(utilityElectricityBills.outletId, outletId))
      .orderBy(desc(utilityElectricityBills.dueDate), desc(utilityElectricityBills.billingPeriodEnd))
      .all();

    const elecAccounts = await this.db
      .select()
      .from(utilityElectricityAccounts)
      .where(eq(utilityElectricityAccounts.outletId, outletId))
      .all();

    if (elecBills.length > 0) {
      const accountById = new Map(elecAccounts.map((a) => [a.id, a]));
      const pendingBills = elecBills.filter((b) => b.status === 'PENDING');
      const primaryBill = pendingBills.length > 0 ? pendingBills[pendingBills.length - 1] : elecBills[0];
      const account = accountById.get(primaryBill.electricityAccountId);
      const totalPendingPaise = pendingBills.reduce((acc, b) => acc + b.billAmountPaise, 0);
      const docIds = Array.from(
        new Set(
          elecBills
            .flatMap((b) => [b.billDocumentId, b.paymentReceiptDocumentId])
            .filter((x): x is string => Boolean(x))
        )
      );
      const isPending = pendingBills.length > 0;
      const isOverdue = isPending && pendingBills.some((b) => b.dueDate < reportDate);

      map.set('ELECTRICITY_BILL', {
        source: 'UTILITY_BILLS_MODULE',
        sourceLabel: 'Utility Bills Management',
        recordCount: elecBills.length,
        referenceNumber:
          primaryBill.paymentReference ||
          (account ? `Consumer #${account.consumerNumber}` : `${primaryBill.billingPeriodStart}..${primaryBill.billingPeriodEnd}`),
        dueDate: primaryBill.dueDate,
        amountPaise: isPending ? totalPendingPaise : primaryBill.billAmountPaise,
        frequency: account?.billingCycle || 'Monthly',
        paymentStatus: isOverdue ? 'OVERDUE' : isPending ? 'PENDING' : 'PAID',
        paidAt: primaryBill.paidAt ? primaryBill.paidAt.slice(0, 10) : null,
        documentIds: docIds,
        summaryText: isPending
          ? `${pendingBills.length} unpaid electricity bill(s) due on ${primaryBill.dueDate}`
          : `Electricity bill paid for period ending ${primaryBill.billingPeriodEnd}`,
      });
    }

    return map;
  }

  /**
   * Builds the full list of merged compliance records (all 14 standard categories in predefined order
   * plus any custom categories for the outlet), integrating authoritative linked modules and flagging discrepancies.
   */
  async getOutletComplianceRegister(params: {
    outletId: string;
    reportDate?: string;
    search?: string;
    categoryFilter?: string;
  }): Promise<{
    outlet: { id: string; roCode: string; name: string; outletType: string };
    reportDate: string;
    items: CocoComplianceMergedItem[];
    filteredItems: CocoComplianceMergedItem[];
    dueDatesAndActions: CocoDueDatesAndActionsSummary;
    summary: CocoOnePagerReport['summary'];
  }> {
    const reportDate =
      params.reportDate && /^\d{4}-\d{2}-\d{2}$/.test(params.reportDate.trim())
        ? params.reportDate.trim()
        : new Date().toISOString().slice(0, 10);

    const outlet = await this.db
      .select({
        id: retailOutlets.id,
        roCode: retailOutlets.roCode,
        name: retailOutlets.name,
        outletType: retailOutlets.outletType,
      })
      .from(retailOutlets)
      .where(eq(retailOutlets.id, params.outletId))
      .get();

    if (!outlet) {
      throw new CocoComplianceError('OUTLET_NOT_FOUND', 'Selected retail outlet was not found.', 404);
    }

    const dbRecords = await this.db
      .select()
      .from(cocoComplianceRecords)
      .where(eq(cocoComplianceRecords.outletId, params.outletId))
      .all();

    const linkedModules = await this.loadLinkedModuleSummaries(params.outletId, reportDate);

    const outletDocs = await this.db
      .select({
        id: documents.id,
        name: documents.name,
        mimeType: documents.mimeType,
        sizeBytes: documents.sizeBytes,
        createdAt: documents.createdAt,
      })
      .from(documents)
      .where(eq(documents.outletId, params.outletId))
      .all();

    const docMap = new Map<string, CocoAttachmentInfo>(
      outletDocs.map((d) => [d.id, d])
    );

    const recordByCategoryCode = new Map(
      dbRecords.map((r) => [r.categoryCode, r])
    );

    const mergedItems: CocoComplianceMergedItem[] = [];

    // 1. Process all 14 predefined categories in exact order (1..14)
    for (const stdCat of STANDARD_COCO_CATEGORIES) {
      const manualRec = recordByCategoryCode.get(stdCat.code) || null;
      const linked = linkedModules.get(stdCat.code) || null;

      mergedItems.push(
        this.mergeCategoryItem({
          outlet,
          srNo: stdCat.srNo,
          categoryCode: stdCat.code,
          categoryName: stdCat.particular,
          isCustomCategory: false,
          defaultFrequency: stdCat.defaultFrequency,
          manualRec,
          linked,
          docMap,
          reportDate,
        })
      );
    }

    // 2. Process any custom categories for this outlet
    const customRecs = dbRecords
      .filter((r) => !STANDARD_CATEGORY_MAP.has(r.categoryCode))
      .sort((a, b) => a.displayOrder - b.displayOrder || a.categoryName.localeCompare(b.categoryName));

    let nextSrNo = STANDARD_COCO_CATEGORIES.length + 1;
    for (const customRec of customRecs) {
      mergedItems.push(
        this.mergeCategoryItem({
          outlet,
          srNo: nextSrNo++,
          categoryCode: customRec.categoryCode,
          categoryName: customRec.categoryName,
          isCustomCategory: true,
          defaultFrequency: customRec.frequency || 'As Required',
          manualRec: customRec,
          linked: null,
          docMap,
          reportDate,
        })
      );
    }

    const dueDatesAndActions = buildDueDatesAndActionsSummary(mergedItems);

    const summary: CocoOnePagerReport['summary'] = {
      totalCategories: mergedItems.length,
      validCount: mergedItems.filter((i) => i.complianceStatus === 'VALID').length,
      expiringSoonCount: mergedItems.filter((i) => i.complianceStatus === 'EXPIRING_SOON').length,
      expiredCount: mergedItems.filter((i) => i.complianceStatus === 'EXPIRED').length,
      paymentPendingCount: mergedItems.filter((i) => i.complianceStatus === 'PAYMENT_PENDING').length,
      actionRequiredCount: mergedItems.filter((i) => i.complianceStatus === 'ACTION_REQUIRED').length,
      notRecordedCount: mergedItems.filter((i) => i.complianceStatus === 'NOT_RECORDED').length,
      notApplicableCount: mergedItems.filter((i) => i.complianceStatus === 'NOT_APPLICABLE').length,
      discrepancyCount: mergedItems.filter((i) => i.hasDiscrepancy).length,
    };

    // Apply optional search & category filters for Tab 1 table view
    let filteredItems = mergedItems;
    if (params.categoryFilter && params.categoryFilter.trim() !== '' && params.categoryFilter !== 'ALL') {
      const catFilter = params.categoryFilter.trim();
      filteredItems = filteredItems.filter((i) => i.categoryCode === catFilter);
    }
    if (params.search && params.search.trim() !== '') {
      const q = params.search.trim().toLowerCase();
      filteredItems = filteredItems.filter(
        (i) =>
          i.categoryName.toLowerCase().includes(q) ||
          i.categoryCode.toLowerCase().includes(q) ||
          (i.documentTitle && i.documentTitle.toLowerCase().includes(q)) ||
          (i.referenceNumber && i.referenceNumber.toLowerCase().includes(q)) ||
          (i.remarks && i.remarks.toLowerCase().includes(q)) ||
          (i.actionRequired && i.actionRequired.toLowerCase().includes(q)) ||
          (i.responsiblePerson && i.responsiblePerson.toLowerCase().includes(q))
      );
    }

    return {
      outlet,
      reportDate,
      items: mergedItems,
      filteredItems,
      dueDatesAndActions,
      summary,
    };
  }

  private mergeCategoryItem(params: {
    outlet: { id: string; roCode: string; name: string };
    srNo: number;
    categoryCode: string;
    categoryName: string;
    isCustomCategory: boolean;
    defaultFrequency: string;
    manualRec: typeof cocoComplianceRecords.$inferSelect | null;
    linked: LinkedModuleSummary | null;
    docMap: Map<string, CocoAttachmentInfo>;
    reportDate: string;
  }): CocoComplianceMergedItem {
    const { outlet, srNo, categoryCode, categoryName, isCustomCategory, manualRec, linked, docMap, reportDate } =
      params;

    const hasRecordOrModuleData = Boolean(manualRec || linked);

    // Check for discrepancies when both manual record and authoritative module data exist
    let hasDiscrepancy = false;
    const discrepancyMessages: string[] = [];

    if (manualRec && linked) {
      if (
        manualRec.paymentStatus !== 'NOT_RECORDED' &&
        linked.paymentStatus !== 'NOT_RECORDED' &&
        manualRec.paymentStatus !== linked.paymentStatus
      ) {
        // E.g. manual says PAID while module says PENDING/OVERDUE or vice versa
        const normManual = manualRec.paymentStatus === 'OVERDUE' ? 'PENDING' : manualRec.paymentStatus;
        const normLinked = linked.paymentStatus === 'OVERDUE' ? 'PENDING' : linked.paymentStatus;
        if (normManual !== normLinked) {
          hasDiscrepancy = true;
          discrepancyMessages.push(
            `Payment status mismatch: ${linked.sourceLabel} shows ${linked.paymentStatus} vs manual entry ${manualRec.paymentStatus}`
          );
        }
      }

      if (
        manualRec.amountPaise !== null &&
        manualRec.amountPaise !== undefined &&
        linked.amountPaise !== null &&
        linked.amountPaise !== undefined &&
        manualRec.amountPaise !== linked.amountPaise
      ) {
        hasDiscrepancy = true;
        discrepancyMessages.push(
          `Amount mismatch: ${linked.sourceLabel} shows ${formatIndianCurrencyFromPaise(linked.amountPaise)} vs manual entry ${formatIndianCurrencyFromPaise(manualRec.amountPaise)}`
        );
      }

      if (
        manualRec.validityDueDate &&
        linked.dueDate &&
        manualRec.validityDueDate !== linked.dueDate
      ) {
        hasDiscrepancy = true;
        discrepancyMessages.push(
          `Due date mismatch: ${linked.sourceLabel} shows ${linked.dueDate} vs manual entry ${manualRec.validityDueDate}`
        );
      }
    }

    // Authoritative values: module data is authoritative for financial/payment/due fields when present
    const authoritativeSource: CocoAuthoritativeSource = linked
      ? linked.source
      : manualRec
      ? 'MANUAL'
      : 'NONE';

    const validityDueDate = linked?.dueDate ?? manualRec?.validityDueDate ?? null;
    const amountPaise = linked?.amountPaise ?? manualRec?.amountPaise ?? null;
    const frequency =
      linked?.frequency ??
      manualRec?.frequency ??
      (hasRecordOrModuleData ? params.defaultFrequency : null);

    let paymentStatus: CocoPaymentStatus =
      linked?.paymentStatus ??
      (manualRec?.paymentStatus as CocoPaymentStatus | undefined) ??
      'NOT_RECORDED';

    // If a manual record is PENDING and its due date is before reportDate, mark OVERDUE
    if (paymentStatus === 'PENDING' && validityDueDate && validityDueDate < reportDate) {
      paymentStatus = 'OVERDUE';
    }

    const paymentDate = linked?.paidAt ?? manualRec?.paymentDate ?? null;
    const referenceNumber = linked?.referenceNumber ?? manualRec?.referenceNumber ?? null;
    const documentTitle =
      manualRec?.documentTitle ??
      (linked ? `${categoryName} (${linked.sourceLabel})` : null);

    let statusYesNo: CocoStatusYesNo = (manualRec?.statusYesNo as CocoStatusYesNo) || 'NOT_RECORDED';
    if (linked) {
      if (linked.paymentStatus === 'PAID') {
        statusYesNo = 'YES';
      } else if (linked.paymentStatus === 'PENDING' || linked.paymentStatus === 'OVERDUE') {
        statusYesNo = 'NO';
      }
    }

    const remarksParts: string[] = [];
    if (linked?.summaryText) {
      remarksParts.push(linked.summaryText);
    }
    if (manualRec?.remarks && manualRec.remarks.trim() !== '') {
      remarksParts.push(manualRec.remarks.trim());
    }
    const remarks = remarksParts.length > 0 ? remarksParts.join(' | ') : null;

    const actionRequired = manualRec?.actionRequired ?? null;

    const manualAttachmentIds = this.parseAttachmentIds(manualRec?.attachmentDocumentIdsJson);
    const combinedDocIds = Array.from(
      new Set([...(linked?.documentIds || []), ...manualAttachmentIds])
    );
    const attachments = combinedDocIds
      .map((id) => docMap.get(id))
      .filter((x): x is CocoAttachmentInfo => Boolean(x));

    const evaluated = evaluateComplianceStatus({
      hasRecordOrModuleData,
      statusYesNo,
      validityDueDate,
      paymentStatus,
      manualComplianceOverride: (manualRec?.complianceStatus as CocoComplianceStatus | undefined) ?? null,
      actionRequired,
      reportDate,
    });

    return {
      id: manualRec?.id ?? null,
      outletId: outlet.id,
      roCode: outlet.roCode,
      outletName: outlet.name,
      srNo,
      categoryCode,
      categoryName,
      isCustomCategory,
      documentTitle,
      referenceNumber,
      issueDate: manualRec?.issueDate ?? null,
      validityDueDate,
      lastServiceDate: manualRec?.lastServiceDate ?? null,
      amountPaise,
      frequency,
      paymentStatus,
      paymentDate,
      documentValidityStatus: evaluated.documentValidityStatus,
      complianceStatus: evaluated.complianceStatus,
      statusYesNo,
      remarks,
      actionRequired,
      responsiblePerson: manualRec?.responsiblePerson ?? null,
      attachmentDocumentIds: combinedDocIds,
      attachments,
      authoritativeSource,
      linkedModuleData: linked,
      hasDiscrepancy,
      discrepancyNote: hasDiscrepancy ? discrepancyMessages.join('; ') : null,
      daysUntilDue: evaluated.daysUntilDue,
      createdBy: manualRec?.createdBy ?? null,
      updatedBy: manualRec?.updatedBy ?? null,
      createdAt: manualRec?.createdAt ?? null,
      updatedAt: manualRec?.updatedAt ?? null,
    };
  }

  /**
   * Builds the One-Pager report preview and PDF model for a selected COCO outlet and report date.
   */
  async getOnePagerReport(params: {
    outletId: string;
    reportDate?: string;
    actorUserId: string;
  }): Promise<CocoOnePagerReport> {
    const register = await this.getOutletComplianceRegister({
      outletId: params.outletId,
      reportDate: params.reportDate,
    });

    const actor = await this.db
      .select({ name: users.name, email: users.email })
      .from(users)
      .where(eq(users.id, params.actorUserId))
      .get();

    const generatedBy = actor ? `${actor.name} (${actor.email})` : params.actorUserId;
    const generatedAt = new Date().toISOString();

    const standardItems = register.items.filter((i) => !i.isCustomCategory);
    const customItems = register.items.filter((i) => i.isCustomCategory);

    return {
      outletId: register.outlet.id,
      outletName: register.outlet.name,
      roCode: register.outlet.roCode,
      reportDate: register.reportDate,
      generatedAt,
      generatedBy,
      rows: standardItems.map(toCocoOnePagerRow),
      customRows: customItems.map(toCocoOnePagerRow),
      summary: register.summary,
    };
  }

  /**
   * Creates or updates a compliance record for a category on an outlet.
   */
  async upsertComplianceRecord(
    input: UpsertCocoComplianceRecordInput,
    actorUserId: string
  ): Promise<{
    record: typeof cocoComplianceRecords.$inferSelect;
    previousRecord: typeof cocoComplianceRecords.$inferSelect | null;
    isCreated: boolean;
  }> {
    const outlet = await this.db
      .select({
        id: retailOutlets.id,
        roCode: retailOutlets.roCode,
        name: retailOutlets.name,
      })
      .from(retailOutlets)
      .where(eq(retailOutlets.id, input.outletId))
      .get();

    if (!outlet) {
      throw new CocoComplianceError('OUTLET_NOT_FOUND', 'Retail outlet not found.', 404);
    }

    const rawCategoryCode = (input.categoryCode || '').trim().toUpperCase();
    if (!rawCategoryCode) {
      throw new CocoComplianceError('INVALID_CATEGORY', 'Category code is required.', 400);
    }

    const stdDef = STANDARD_CATEGORY_MAP.get(rawCategoryCode);
    const isCustomCategory = !stdDef;
    const categoryName = stdDef
      ? stdDef.particular
      : (input.categoryName || '').trim();

    if (!categoryName) {
      throw new CocoComplianceError(
        'INVALID_CATEGORY_NAME',
        'Custom category name is required when adding a custom compliance category.',
        400
      );
    }

    const validateOptDate = (val: string | null | undefined, label: string): string | null => {
      if (!val || val.trim() === '') return null;
      const clean = val.trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(clean)) {
        throw new CocoComplianceError(
          'INVALID_DATE_FORMAT',
          `${label} must be in YYYY-MM-DD format.`,
          400
        );
      }
      return clean;
    };

    const issueDate = validateOptDate(input.issueDate, 'Issue date');
    const validityDueDate = validateOptDate(input.validityDueDate, 'Validity / due date');
    const lastServiceDate = validateOptDate(input.lastServiceDate, 'Last service date');
    const paymentDate = validateOptDate(input.paymentDate, 'Payment date');

    if (issueDate && validityDueDate && validityDueDate < issueDate) {
      throw new CocoComplianceError(
        'INVALID_DATE_RANGE',
        'Validity / due date cannot be earlier than the issue date.',
        400
      );
    }

    let amountPaise: number | null = null;
    if (input.amountPaise !== null && input.amountPaise !== undefined) {
      if (!Number.isInteger(input.amountPaise) || input.amountPaise < 0) {
        throw new CocoComplianceError(
          'INVALID_AMOUNT',
          'Amount must be a non-negative integer in paise.',
          400
        );
      }
      amountPaise = input.amountPaise;
    }

    const validatedAttachmentIds = await this.validateAttachmentIdsForOutlet(
      outlet.id,
      input.attachmentDocumentIds || []
    );

    const paymentStatus: CocoPaymentStatus = input.paymentStatus || 'NOT_RECORDED';
    const statusYesNo: CocoStatusYesNo = input.statusYesNo || 'YES';
    const reportDate = new Date().toISOString().slice(0, 10);

    const evaluated = evaluateComplianceStatus({
      hasRecordOrModuleData: true,
      statusYesNo,
      validityDueDate,
      paymentStatus,
      manualComplianceOverride: input.complianceStatus ?? null,
      actionRequired: input.actionRequired ?? null,
      reportDate,
    });

    const existing = await this.db
      .select()
      .from(cocoComplianceRecords)
      .where(
        and(
          eq(cocoComplianceRecords.outletId, outlet.id),
          eq(cocoComplianceRecords.categoryCode, rawCategoryCode)
        )
      )
      .get();

    const now = new Date().toISOString();

    if (existing) {
      await this.db
        .update(cocoComplianceRecords)
        .set({
          roCodeSnapshot: outlet.roCode,
          categoryName,
          documentTitle: input.documentTitle?.trim() || null,
          referenceNumber: input.referenceNumber?.trim() || null,
          issueDate,
          validityDueDate,
          lastServiceDate,
          amountPaise,
          frequency: input.frequency?.trim() || (stdDef ? stdDef.defaultFrequency : null),
          paymentStatus,
          paymentDate,
          complianceStatus: input.complianceStatus || evaluated.complianceStatus,
          statusYesNo,
          remarks: input.remarks?.trim() || null,
          actionRequired: input.actionRequired?.trim() || null,
          responsiblePerson: input.responsiblePerson?.trim() || null,
          attachmentDocumentIdsJson: JSON.stringify(validatedAttachmentIds),
          updatedBy: actorUserId,
          updatedAt: now,
        })
        .where(eq(cocoComplianceRecords.id, existing.id));

      const updated = await this.db
        .select()
        .from(cocoComplianceRecords)
        .where(eq(cocoComplianceRecords.id, existing.id))
        .get();

      return {
        record: updated!,
        previousRecord: existing,
        isCreated: false,
      };
    }

    const newId = `ccr-${crypto.randomUUID()}`;
    const displayOrder = stdDef ? stdDef.srNo : 99;

    await this.db.insert(cocoComplianceRecords).values({
      id: newId,
      outletId: outlet.id,
      roCodeSnapshot: outlet.roCode,
      categoryCode: rawCategoryCode,
      categoryName,
      displayOrder,
      isCustomCategory: isCustomCategory ? 1 : 0,
      documentTitle: input.documentTitle?.trim() || null,
      referenceNumber: input.referenceNumber?.trim() || null,
      issueDate,
      validityDueDate,
      lastServiceDate,
      amountPaise,
      frequency: input.frequency?.trim() || (stdDef ? stdDef.defaultFrequency : null),
      paymentStatus,
      paymentDate,
      complianceStatus: input.complianceStatus || evaluated.complianceStatus,
      statusYesNo,
      remarks: input.remarks?.trim() || null,
      actionRequired: input.actionRequired?.trim() || null,
      responsiblePerson: input.responsiblePerson?.trim() || null,
      attachmentDocumentIdsJson: JSON.stringify(validatedAttachmentIds),
      createdBy: actorUserId,
      updatedBy: actorUserId,
      createdAt: now,
      updatedAt: now,
    });

    const created = await this.db
      .select()
      .from(cocoComplianceRecords)
      .where(eq(cocoComplianceRecords.id, newId))
      .get();

    return {
      record: created!,
      previousRecord: null,
      isCreated: true,
    };
  }

  /**
   * Updates an existing compliance record by ID.
   */
  async updateComplianceRecordById(
    recordId: string,
    input: Partial<UpsertCocoComplianceRecordInput>,
    actorUserId: string
  ): Promise<{
    record: typeof cocoComplianceRecords.$inferSelect;
    previousRecord: typeof cocoComplianceRecords.$inferSelect;
  }> {
    const existing = await this.db
      .select()
      .from(cocoComplianceRecords)
      .where(eq(cocoComplianceRecords.id, recordId))
      .get();

    if (!existing) {
      throw new CocoComplianceError('RECORD_NOT_FOUND', 'Compliance record not found.', 404);
    }

    const existingAttachments = this.parseAttachmentIds(existing.attachmentDocumentIdsJson);

    const res = await this.upsertComplianceRecord(
      {
        outletId: existing.outletId,
        categoryCode: existing.categoryCode,
        categoryName: input.categoryName ?? existing.categoryName,
        isCustomCategory: existing.isCustomCategory === 1,
        documentTitle: input.documentTitle !== undefined ? input.documentTitle : existing.documentTitle,
        referenceNumber: input.referenceNumber !== undefined ? input.referenceNumber : existing.referenceNumber,
        issueDate: input.issueDate !== undefined ? input.issueDate : existing.issueDate,
        validityDueDate: input.validityDueDate !== undefined ? input.validityDueDate : existing.validityDueDate,
        lastServiceDate: input.lastServiceDate !== undefined ? input.lastServiceDate : existing.lastServiceDate,
        amountPaise: input.amountPaise !== undefined ? input.amountPaise : existing.amountPaise,
        frequency: input.frequency !== undefined ? input.frequency : existing.frequency,
        paymentStatus:
          (input.paymentStatus as CocoPaymentStatus | undefined) ??
          (existing.paymentStatus as CocoPaymentStatus),
        paymentDate: input.paymentDate !== undefined ? input.paymentDate : existing.paymentDate,
        complianceStatus:
          (input.complianceStatus as CocoComplianceStatus | undefined) ??
          (existing.complianceStatus as CocoComplianceStatus),
        statusYesNo:
          (input.statusYesNo as CocoStatusYesNo | undefined) ??
          (existing.statusYesNo as CocoStatusYesNo),
        remarks: input.remarks !== undefined ? input.remarks : existing.remarks,
        actionRequired: input.actionRequired !== undefined ? input.actionRequired : existing.actionRequired,
        responsiblePerson:
          input.responsiblePerson !== undefined ? input.responsiblePerson : existing.responsiblePerson,
        attachmentDocumentIds:
          input.attachmentDocumentIds !== undefined ? input.attachmentDocumentIds : existingAttachments,
      },
      actorUserId
    );

    return {
      record: res.record,
      previousRecord: existing,
    };
  }
}
