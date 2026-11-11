import './adminModern.css';
import React, { useState, useEffect } from 'react';
import { apiFetch, clearApiCache } from '../services/api';
import { useAuth } from '../context/AuthContext';
import {
  RetailOutlet,
  Product,
  OutletProduct,
  Tank,
  TankCalibrationChart,
  TankCalibrationPoint,
  TankCalibrationDryRunReport,
  Dispenser,
  Nozzle,
  NozzleDiagnosticItem,
  OutletNozzleDiagnosticsReport,
  ShiftTemplate,
} from '../../shared/types';
import {
  Building2,
  Fuel,
  Gauge,
  Layers,
  Clock,
  Plus,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  Check,
  X,
  MapPin,
  Flame,
  Sliders,
  ChevronRight,
  Edit2,
  Trash2,
  Upload,
  Network,
  AlertTriangle,
  CheckCircle,
  Lock,
  GitBranch,
  FileSpreadsheet,
  FlaskConical,
} from 'lucide-react';
import {
  getDuTypeLabel,
  getAvailableNozzleNumbers,
  getTanksForProduct,
  getActiveLiquidOutletProducts,
  resolveNozzleFormState,
  getDuUtilization,
  buildFuelMappingTree,
  getPumpInfrastructureErrorMessage,
  getProductCategoryBadgeClass,
  filterTanksForEditNozzle,
  findTankProduct,
  getTankCalibrationStatus,
  formatCalibrationDisplay,
  formatDummyCalibrationPresetText,
  validateSingleCalibrationPoint,
  parseBulkCalibrationText,
  buildCalibrationImportPreview,
  analyzeCalibrationChartDiagnostics,
  parseDryRunCheckpointsText,
  buildSampleDryRunCheckpointsText,
  evaluateCalibrationDryRunClient,
  ClientDryRunReport,
} from '../components/pump/pumpInfrastructureUi';
import { PERMISSIONS } from '../../shared/constants';
import { GlobalCalibrationMasterSection } from '../components/pump/GlobalCalibrationMasterSection';

import { useActiveOutlet } from '../context/ActiveOutletContext';

export const PumpInfrastructurePage: React.FC = () => {
  const { userCtx, hasPermission } = useAuth();
  const canWriteProducts = hasPermission(PERMISSIONS.OUTLET_PRODUCTS_WRITE);
  const canWriteTanks = hasPermission(PERMISSIONS.TANKS_WRITE);
  const canWriteDispensers = hasPermission(PERMISSIONS.DISPENSERS_WRITE);
  const canWriteNozzles = hasPermission(PERMISSIONS.NOZZLES_WRITE);
  const canWriteShifts = hasPermission(PERMISSIONS.SHIFT_TEMPLATES_WRITE);
  const canWriteTankCalibration = hasPermission(PERMISSIONS.TANK_CALIBRATION_WRITE);
  const canApproveCalibrationChart = canWriteTankCalibration && canWriteTanks;
  const canReadTankCalibration =
    hasPermission(PERMISSIONS.TANK_CALIBRATION_READ) || canWriteTankCalibration;

  const { activeOutletId, accessibleOutlets: outlets, loading: loadingOutlets, setActiveOutletId } = useActiveOutlet();
  const selectedOutletId = activeOutletId || '';
  const setSelectedOutletId = setActiveOutletId;

  // Active Sub-tab
  const [activeTab, setActiveTab] = useState<'products' | 'tanks' | 'globalCalibration' | 'dispensers' | 'nozzles' | 'shifts' | 'fuelMapping'>('products');

  // Outlet-specific data
  const [catalogProducts, setCatalogProducts] = useState<Product[]>([]);
  const [outletProducts, setOutletProducts] = useState<OutletProduct[]>([]);
  const [tanks, setTanks] = useState<Tank[]>([]);
  const [dispensers, setDispensers] = useState<Dispenser[]>([]);
  const [nozzles, setNozzles] = useState<Nozzle[]>([]);
  const [nozzleDiagnostics, setNozzleDiagnostics] = useState<OutletNozzleDiagnosticsReport | null>(null);
  const [shiftTemplates, setShiftTemplates] = useState<ShiftTemplate[]>([]);

  const [loadingData, setLoadingData] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Modals
  const [modalType, setModalType] = useState<
    | 'mapProduct'
    | 'addTank'
    | 'editTank'
    | 'tankCalibration'
    | 'addDispenser'
    | 'editDispenser'
    | 'addNozzle'
    | 'editNozzle'
    | 'addShift'
    | 'editShift'
    | null
  >(null);
  const [modalSubmitting, setModalSubmitting] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  // Tank Calibration Chart states
  const [tankCalibrationByTankId, setTankCalibrationByTankId] = useState<
    Record<string, TankCalibrationPoint[]>
  >({});
  const [calibratingTank, setCalibratingTank] = useState<Tank | null>(null);
  const [loadingCalibrationTankId, setLoadingCalibrationTankId] = useState<string | null>(null);
  const [calCharts, setCalCharts] = useState<TankCalibrationChart[]>([]);
  const [calActiveChart, setCalActiveChart] = useState<TankCalibrationChart | null>(null);
  const [calSelectedChart, setCalSelectedChart] = useState<TankCalibrationChart | null>(null);
  const [calModalPoints, setCalModalPoints] = useState<TankCalibrationPoint[]>([]);
  const [calEditingPoint, setCalEditingPoint] = useState<TankCalibrationPoint | null>(null);
  const [calDipInput, setCalDipInput] = useState('');
  const [calVolumeInput, setCalVolumeInput] = useState('');
  const [calShowBulkImport, setCalShowBulkImport] = useState(false);
  const [calBulkText, setCalBulkText] = useState('');
  const [calAllowOverCapacity, setCalAllowOverCapacity] = useState(false);
  const [calDiameterMmInput, setCalDiameterMmInput] = useState('');
  const [calLengthMmInput, setCalLengthMmInput] = useState('');
  const [calMaxDipMmInput, setCalMaxDipMmInput] = useState('');
  const [calSourceFileName, setCalSourceFileName] = useState('');
  const [calReferenceDocument, setCalReferenceDocument] = useState('');
  const [calEffectiveFrom, setCalEffectiveFrom] = useState('');
  const [calNotes, setCalNotes] = useState('');
  const [calSaveMode, setCalSaveMode] = useState<'ACTIVE' | 'DRAFT'>('DRAFT');
  const [calShowPreview, setCalShowPreview] = useState(false);

  // Dry-Run Comparison states
  const [calShowDryRun, setCalShowDryRun] = useState(false);
  const [calDryRunText, setCalDryRunText] = useState('');
  const [calDryRunTolerance, setCalDryRunTolerance] = useState('0.500');
  const [calDryRunSource, setCalDryRunSource] = useState<'SAVED_CHART' | 'CSV_PREVIEW'>('SAVED_CHART');
  const [calDryRunReport, setCalDryRunReport] = useState<TankCalibrationDryRunReport | ClientDryRunReport | null>(null);

  // Form states
  const [selectedProductId, setSelectedProductId] = useState('');
  const [tankNumber, setTankNumber] = useState(1);
  const [tankName, setTankName] = useState('');
  const [tankCapacity, setTankCapacity] = useState(20000);
  const [tankSafeFill, setTankSafeFill] = useState(19000);
  const [tankMinOperating, setTankMinOperating] = useState(1000);

  // Edit Tank states
  const [editingTank, setEditingTank] = useState<Tank | null>(null);
  const [editTankName, setEditTankName] = useState('');
  const [editTankProductId, setEditTankProductId] = useState('');
  const [editTankCapacity, setEditTankCapacity] = useState(20000);
  const [editTankSafeFill, setEditTankSafeFill] = useState(19000);
  const [editTankMinOperating, setEditTankMinOperating] = useState(1000);
  const [editTankStatus, setEditTankStatus] = useState<'ACTIVE' | 'INACTIVE' | 'MAINTENANCE' | 'DECOMMISSIONED'>('ACTIVE');

  const [dispNumber, setDispNumber] = useState(1);
  const [dispName, setDispName] = useState('');
  const [dispManufacturer, setDispManufacturer] = useState('');
  const [dispModel, setDispModel] = useState('');
  const [dispSerial, setDispSerial] = useState('');
  const [dispNozzleCapacity, setDispNozzleCapacity] = useState<2 | 4 | 6>(6);
  const [dispStatus, setDispStatus] = useState<'ACTIVE' | 'INACTIVE' | 'MAINTENANCE' | 'DECOMMISSIONED'>('ACTIVE');
  const [dispCommissionedAt, setDispCommissionedAt] = useState('');
  const [editingDispenser, setEditingDispenser] = useState<Dispenser | null>(null);

  const [nozzleDispenserId, setNozzleDispenserId] = useState('');
  const [nozzleNumber, setNozzleNumber] = useState(1);
  const [nozzleProductId, setNozzleProductId] = useState('');
  const [nozzleTankId, setNozzleTankId] = useState('');

  // Edit Nozzle states
  const [editingNozzle, setEditingNozzle] = useState<Nozzle | null>(null);
  const [editNozzleProductId, setEditNozzleProductId] = useState('');
  const [editNozzleTankId, setEditNozzleTankId] = useState('');
  const [editNozzleStatus, setEditNozzleStatus] = useState<'ACTIVE' | 'INACTIVE' | 'MAINTENANCE' | 'DECOMMISSIONED'>('ACTIVE');

  // Shift Template states
  const [shiftCode, setShiftCode] = useState('');
  const [shiftName, setShiftName] = useState('');
  const [shiftStart, setShiftStart] = useState('06:00');
  const [shiftEnd, setShiftEnd] = useState('14:00');
  const [shiftSeq, setShiftSeq] = useState(1);

  // Edit Shift Template states
  const [editingShift, setEditingShift] = useState<ShiftTemplate | null>(null);
  const [editShiftName, setEditShiftName] = useState('');
  const [editShiftStart, setEditShiftStart] = useState('06:00');
  const [editShiftEnd, setEditShiftEnd] = useState('14:00');
  const [editShiftSeq, setEditShiftSeq] = useState(1);
  const [editShiftStatus, setEditShiftStatus] = useState<'ACTIVE' | 'INACTIVE'>('ACTIVE');

  // Load Catalog Products once
  useEffect(() => {
    const loadCatalog = async () => {
      const res = await apiFetch<Product[]>('/api/v1/products');
      if (res.success && res.data) {
        setCatalogProducts(res.data);
      }
    };
    loadCatalog();
  }, []);

  // Load outlet operational data whenever selected outlet changes
  const loadOutletData = async () => {
    if (!selectedOutletId) {
      setOutletProducts([]);
      setTanks([]);
      setTankCalibrationByTankId({});
      setDispensers([]);
      setNozzles([]);
      setNozzleDiagnostics(null);
      setShiftTemplates([]);
      return;
    }
    setLoadingData(true);
    setError(null);

    // Clear stale data prior to fetching
    setOutletProducts([]);
    setTanks([]);
    setTankCalibrationByTankId({});
    setDispensers([]);
    setNozzles([]);
    setNozzleDiagnostics(null);
    setShiftTemplates([]);

    const [pRes, tRes, dRes, nRes, diagRes, sRes] = await Promise.all([
      apiFetch<OutletProduct[]>(`/api/v1/outlets/${selectedOutletId}/products`),
      apiFetch<Tank[]>(`/api/v1/outlets/${selectedOutletId}/tanks`),
      apiFetch<Dispenser[]>(`/api/v1/outlets/${selectedOutletId}/dispensers`),
      apiFetch<Nozzle[]>(`/api/v1/outlets/${selectedOutletId}/nozzles`),
      apiFetch<OutletNozzleDiagnosticsReport>(`/api/v1/outlets/${selectedOutletId}/nozzles/diagnostics`),
      apiFetch<ShiftTemplate[]>('/api/v1/shift-templates'),
    ]);

    const failures: string[] = [];
    if (pRes.success && pRes.data) setOutletProducts(pRes.data); else failures.push('products');
    if (tRes.success && tRes.data) {
      setTanks(tRes.data);
      if (canReadTankCalibration && tRes.data.length > 0) {
        const calEntries = await Promise.all(
          tRes.data.map(async (tank) => {
            const calRes = await apiFetch<TankCalibrationPoint[]>(
              `/api/v1/tanks/${tank.id}/calibration`,
              { cache: 'no-store' }
            );
            return [tank.id, calRes.success && calRes.data ? calRes.data : []] as const;
          })
        );
        const calMap: Record<string, TankCalibrationPoint[]> = {};
        for (const [tid, pts] of calEntries) {
          calMap[tid] = pts;
        }
        setTankCalibrationByTankId(calMap);
      }
    } else {
      failures.push('tanks');
    }
    if (dRes.success && dRes.data) setDispensers(dRes.data); else failures.push('dispensers');
    if (nRes.success && nRes.data) setNozzles(nRes.data); else failures.push('nozzles');
    if (diagRes.success && diagRes.data) setNozzleDiagnostics(diagRes.data);
    if (sRes.success && sRes.data) setShiftTemplates(sRes.data); else failures.push('shift templates');

    if (failures.length > 0) {
      setError(`Failed to load ${failures.join(', ')} for the selected outlet.`);
    }

    setLoadingData(false);
  };

  useEffect(() => {
    loadOutletData();
  }, [selectedOutletId]);

  // Reset dependent fields when outlet changes
  useEffect(() => {
    setNozzleDispenserId('');
    setNozzleNumber(1);
    setNozzleProductId('');
    setNozzleTankId('');
  }, [selectedOutletId]);

  const selectedOutlet = outlets.find(o => o.id === selectedOutletId);

  // Form Submissions
  const handleMapProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (modalSubmitting) return;
    setModalSubmitting(true);
    setModalError(null);

    try {
      const res = await apiFetch(`/api/v1/outlets/${selectedOutletId}/products`, {
        method: 'POST',
        body: JSON.stringify({ productId: selectedProductId, status: 'ACTIVE' }),
      });

      if (res.success) {
        setModalType(null);
        setSuccessMsg('Product mapped to outlet');
        setTimeout(() => setSuccessMsg(null), 3000);
        loadOutletData();
      } else {
        setModalError(getPumpInfrastructureErrorMessage(res.error));
      }
    } finally {
      setModalSubmitting(false);
    }
  };

  const handleAddTank = async (e: React.FormEvent) => {
    e.preventDefault();
    if (modalSubmitting) return;
    setModalSubmitting(true);
    setModalError(null);

    try {
      const res = await apiFetch(`/api/v1/outlets/${selectedOutletId}/tanks`, {
        method: 'POST',
        body: JSON.stringify({
          tankNumber: Number(tankNumber),
          name: tankName,
          productId: selectedProductId,
          capacityLitres: Number(tankCapacity),
          safeFillCapacityLitres: Number(tankSafeFill),
          minimumOperatingLevelLitres: Number(tankMinOperating),
          status: 'ACTIVE',
        }),
      });

      if (res.success) {
        setModalType(null);
        setSuccessMsg('Underground tank created');
        setTimeout(() => setSuccessMsg(null), 3000);
        loadOutletData();
      } else {
        setModalError(getPumpInfrastructureErrorMessage(res.error));
      }
    } finally {
      setModalSubmitting(false);
    }
  };

  const handleAddDispenser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (modalSubmitting) return;
    setModalSubmitting(true);
    setModalError(null);

    try {
      const res = await apiFetch(`/api/v1/outlets/${selectedOutletId}/dispensers`, {
        method: 'POST',
        body: JSON.stringify({
          dispenserNumber: Number(dispNumber),
          name: dispName,
          manufacturer: dispManufacturer || null,
          model: dispModel || null,
          serialNumber: dispSerial || null,
          nozzleCapacity: Number(dispNozzleCapacity),
          status: dispStatus,
          commissionedAt: dispCommissionedAt ? new Date(dispCommissionedAt).toISOString() : null,
        }),
      });

      if (res.success) {
        setModalType(null);
        setSuccessMsg('Dispensing Unit (DU) registered successfully');
        setTimeout(() => setSuccessMsg(null), 3000);
        loadOutletData();
      } else {
        setModalError(getPumpInfrastructureErrorMessage(res.error));
      }
    } finally {
      setModalSubmitting(false);
    }
  };

  const openEditDispenser = (d: Dispenser) => {
    setEditingDispenser(d);
    setDispNumber(d.dispenserNumber);
    setDispName(d.name);
    setDispManufacturer(d.manufacturer || '');
    setDispModel(d.model || '');
    setDispSerial(d.serialNumber || '');
    setDispNozzleCapacity(((d.nozzleCapacity || 6) as 2 | 4 | 6));
    setDispStatus((d.status as any) || 'ACTIVE');
    setDispCommissionedAt(d.commissionedAt ? d.commissionedAt.split('T')[0] : '');
    setModalError(null);
    setModalType('editDispenser');
  };

  const handleEditDispenser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingDispenser || modalSubmitting) return;
    setModalSubmitting(true);
    setModalError(null);

    try {
      const res = await apiFetch(`/api/v1/dispensers/${editingDispenser.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          name: dispName,
          manufacturer: dispManufacturer || null,
          model: dispModel || null,
          serialNumber: dispSerial || null,
          nozzleCapacity: Number(dispNozzleCapacity),
          status: dispStatus,
          commissionedAt: dispCommissionedAt ? new Date(dispCommissionedAt).toISOString() : null,
        }),
      });

      if (res.success) {
        setModalType(null);
        setEditingDispenser(null);
        setSuccessMsg('Dispensing Unit (DU) updated successfully');
        setTimeout(() => setSuccessMsg(null), 3000);
        loadOutletData();
      } else {
        setModalError(getPumpInfrastructureErrorMessage(res.error));
      }
    } finally {
      setModalSubmitting(false);
    }
  };

  const openAddNozzleModal = (preferredDispenserId?: string, preferredNozzleNumber?: number) => {
    if (dispensers.length === 0 || tanks.length === 0) {
      setError('Please add at least one Dispenser (DU) and Underground Tank first');
      return;
    }
    const resolved = resolveNozzleFormState(dispensers, nozzles, outletProducts, tanks, {
      dispenserId: preferredDispenserId || null,
      nozzleNumber: preferredNozzleNumber || null,
    });

    setNozzleDispenserId(resolved.dispenserId);
    setNozzleNumber(resolved.nozzleNumber);
    setNozzleProductId(resolved.productId);
    setNozzleTankId(resolved.tankId);
    setModalError(null);
    setModalType('addNozzle');
  };

  const handleNozzleDispenserChange = (newDispId: string) => {
    setModalError(null);
    const resolved = resolveNozzleFormState(dispensers, nozzles, outletProducts, tanks, {
      dispenserId: newDispId,
      productId: nozzleProductId,
      tankId: nozzleTankId,
    });
    setNozzleDispenserId(resolved.dispenserId);
    setNozzleNumber(resolved.nozzleNumber);
  };

  const handleNozzleProductChange = (newProdId: string) => {
    setModalError(null);
    setNozzleProductId(newProdId);
    const matchingTanks = getTanksForProduct(tanks, newProdId).filter(t => t.status === 'ACTIVE');
    const isCurrentValid = matchingTanks.some(t => t.id === nozzleTankId);
    if (!isCurrentValid) {
      setNozzleTankId(matchingTanks[0]?.id || '');
    }
  };

  const handleAddNozzle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (modalSubmitting) return;
    setModalSubmitting(true);
    setModalError(null);

    try {
      const resolved = resolveNozzleFormState(dispensers, nozzles, outletProducts, tanks, {
        dispenserId: nozzleDispenserId,
        nozzleNumber: Number(nozzleNumber),
        productId: nozzleProductId,
        tankId: nozzleTankId,
      });

      const hasOrphanAtSlot = nozzleDiagnostics?.orphanNozzles?.some(
        o => o.dispenserId === resolved.dispenserId && o.nozzleNumber === resolved.nozzleNumber
      );

      const endpoint = hasOrphanAtSlot
        ? `/api/v1/dispensers/${resolved.dispenserId}/nozzles/reconcile`
        : `/api/v1/dispensers/${resolved.dispenserId}/nozzles`;

      const res = await apiFetch(endpoint, {
        method: 'POST',
        body: JSON.stringify({
          nozzleNumber: resolved.nozzleNumber,
          productId: resolved.productId,
          tankId: resolved.tankId,
          status: 'ACTIVE',
          ...(hasOrphanAtSlot ? { repairOrphan: true } : {}),
        }),
      });

      if (res.success) {
        setModalType(null);
        setSuccessMsg(
          hasOrphanAtSlot
            ? `Nozzle #${resolved.nozzleNumber} topology repaired and synchronized`
            : `Nozzle #${resolved.nozzleNumber} configured successfully`
        );
        setTimeout(() => setSuccessMsg(null), 3000);
        loadOutletData();
      } else {
        setModalError(getPumpInfrastructureErrorMessage(res.error));
      }
    } finally {
      setModalSubmitting(false);
    }
  };

  const openEditNozzle = (n: Nozzle) => {
    setEditingNozzle(n);
    setEditNozzleProductId(n.productId);
    setEditNozzleTankId(n.tankId);
    setEditNozzleStatus((n.status as any) || 'ACTIVE');
    setModalError(null);
    setModalType('editNozzle');
  };

  const handleEditNozzleProductChange = (newProdId: string) => {
    setModalError(null);
    setEditNozzleProductId(newProdId);
    const matchingTanks = filterTanksForEditNozzle(tanks, newProdId);
    const isCurrentValid = matchingTanks.some(t => t.id === editNozzleTankId);
    if (!isCurrentValid) {
      setEditNozzleTankId(matchingTanks[0]?.id || '');
    }
  };

  const handleEditNozzleTankChange = (newTankId: string) => {
    setModalError(null);
    setEditNozzleTankId(newTankId);
    const derivedProdId = findTankProduct(tanks, newTankId);
    if (derivedProdId && derivedProdId !== editNozzleProductId) {
      setEditNozzleProductId(derivedProdId);
    }
  };

  const handleEditNozzle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (modalSubmitting || !editingNozzle) return;
    setModalSubmitting(true);
    setModalError(null);

    try {
      const res = await apiFetch<Nozzle>(`/api/v1/nozzles/${editingNozzle.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          productId: editNozzleProductId,
          tankId: editNozzleTankId,
          status: editNozzleStatus,
        }),
      });

      if (res.success && res.data) {
        const updated = res.data;
        const matchingTank = tanks.find(t => t.id === editNozzleTankId);
        const matchingProd = catalogProducts.find(p => p.id === editNozzleProductId);

        setNozzles(prev =>
          prev.map(item =>
            item.id === editingNozzle.id
              ? {
                  ...item,
                  ...updated,
                  productId: editNozzleProductId,
                  tankId: editNozzleTankId,
                  status: editNozzleStatus,
                  productCode: matchingProd?.code || item.productCode,
                  productName: matchingProd?.name || item.productName,
                  tankNumber: matchingTank?.tankNumber ?? item.tankNumber,
                  tankName: matchingTank?.name ?? item.tankName,
                }
              : item
          )
        );

        setModalType(null);
        setEditingNozzle(null);
        setSuccessMsg(`Nozzle #${editingNozzle.nozzleNumber} mapping updated successfully`);
        setTimeout(() => setSuccessMsg(null), 3000);
        loadOutletData();
      } else {
        setModalError(getPumpInfrastructureErrorMessage(res.error));
      }
    } finally {
      setModalSubmitting(false);
    }
  };

  const openEditTank = (t: Tank) => {
    setEditingTank(t);
    setEditTankName(t.name);
    setEditTankProductId(t.productId);
    setEditTankCapacity(t.capacityLitres);
    setEditTankSafeFill(t.safeFillCapacityLitres);
    setEditTankMinOperating(t.minimumOperatingLevelLitres);
    setEditTankStatus((t.status as any) || 'ACTIVE');
    setModalError(null);
    setModalType('editTank');
  };

  const handleEditTank = async (e: React.FormEvent) => {
    e.preventDefault();
    if (modalSubmitting || !editingTank) return;
    setModalSubmitting(true);
    setModalError(null);

    try {
      const res = await apiFetch<Tank>(`/api/v1/tanks/${editingTank.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          name: editTankName,
          productId: editTankProductId,
          capacityLitres: Number(editTankCapacity),
          safeFillCapacityLitres: Number(editTankSafeFill),
          minimumOperatingLevelLitres: Number(editTankMinOperating),
          status: editTankStatus,
        }),
      });

      if (res.success && res.data) {
        const updated = res.data;
        const matchingProd = catalogProducts.find(p => p.id === editTankProductId);
        setTanks(prev =>
          prev.map(item =>
            item.id === editingTank.id
              ? {
                  ...item,
                  ...updated,
                  name: editTankName,
                  productId: editTankProductId,
                  capacityLitres: Number(editTankCapacity),
                  safeFillCapacityLitres: Number(editTankSafeFill),
                  minimumOperatingLevelLitres: Number(editTankMinOperating),
                  status: editTankStatus,
                  productCode: matchingProd?.code || item.productCode,
                  productName: matchingProd?.name || item.productName,
                }
              : item
          )
        );

        setModalType(null);
        setEditingTank(null);
        setSuccessMsg(`Tank #${editingTank.tankNumber} updated successfully`);
        setTimeout(() => setSuccessMsg(null), 3000);
        loadOutletData();
      } else {
        setModalError(getPumpInfrastructureErrorMessage(res.error));
      }
    } finally {
      setModalSubmitting(false);
    }
  };

  const notifyCalibrationChanged = (tankId: string) => {
    clearApiCache();
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new CustomEvent('iocl:tank-calibration-updated', {
          detail: { outletId: selectedOutletId, tankId },
        })
      );
    }
  };

  const refreshTankCalibration = async (
    tankId: string,
    chartId?: string | null
  ): Promise<TankCalibrationPoint[]> => {
    setLoadingCalibrationTankId(tankId);
    try {
      const query = chartId ? `?chartId=${encodeURIComponent(chartId)}` : '';
      const res = (await apiFetch<TankCalibrationPoint[]>(
        `/api/v1/tanks/${tankId}/calibration${query}`,
        { cache: 'no-store' }
      )) as any;

      const pts: TankCalibrationPoint[] = res.success && Array.isArray(res.data) ? res.data : [];
      const activeChart: TankCalibrationChart | null = res.activeChart ?? null;
      const selectedChart: TankCalibrationChart | null = res.selectedChart ?? activeChart ?? null;
      const charts: TankCalibrationChart[] = Array.isArray(res.charts) ? res.charts : [];

      setCalCharts(charts);
      setCalActiveChart(activeChart);
      setCalSelectedChart(selectedChart);
      setCalModalPoints(pts);

      // Keep tankCalibrationByTankId synced with the active chart's points so tank card badges reflect active status
      if (!chartId || (activeChart && selectedChart && activeChart.id === selectedChart.id)) {
        setTankCalibrationByTankId(prev => ({
          ...prev,
          [tankId]: pts,
        }));
      } else if (activeChart) {
        const activeRes = await apiFetch<TankCalibrationPoint[]>(
          `/api/v1/tanks/${tankId}/calibration`,
          { cache: 'no-store' }
        );
        if (activeRes.success && Array.isArray(activeRes.data)) {
          setTankCalibrationByTankId(prev => ({
            ...prev,
            [tankId]: activeRes.data!,
          }));
        }
      }

      if (selectedChart) {
        setCalDiameterMmInput(selectedChart.tankDiameterMmStr ? formatCalibrationDisplay(selectedChart.tankDiameterMmStr) : '');
        setCalLengthMmInput(selectedChart.tankLengthMmStr ? formatCalibrationDisplay(selectedChart.tankLengthMmStr) : '');
        setCalMaxDipMmInput(selectedChart.maxDipMmStr ? formatCalibrationDisplay(selectedChart.maxDipMmStr) : '');
        setCalReferenceDocument(selectedChart.referenceDocument || '');
        setCalEffectiveFrom(selectedChart.effectiveFrom || '');
        setCalNotes(selectedChart.notes || '');
      }

      return pts;
    } finally {
      setLoadingCalibrationTankId(null);
    }
  };

  const openCalibrationModal = async (t: Tank) => {
    setCalibratingTank(t);
    setCalCharts([]);
    setCalActiveChart(null);
    setCalSelectedChart(null);
    setCalModalPoints([]);
    setCalEditingPoint(null);
    setCalDipInput('');
    setCalVolumeInput('');
    setCalShowBulkImport(false);
    setCalBulkText('');
    setCalAllowOverCapacity(false);
    setCalDiameterMmInput('');
    setCalLengthMmInput('');
    setCalMaxDipMmInput('');
    setCalSourceFileName('');
    setCalReferenceDocument('');
    setCalEffectiveFrom('');
    setCalNotes('');
    setCalSaveMode('DRAFT');
    setCalShowPreview(false);
    setCalShowDryRun(false);
    setCalDryRunText('');
    setCalDryRunTolerance('0.500');
    setCalDryRunSource('SAVED_CHART');
    setCalDryRunReport(null);
    setModalError(null);
    setModalType('tankCalibration');
    await refreshTankCalibration(t.id);
  };

  const handleSelectCalibrationChartRevision = async (chartId: string) => {
    if (!calibratingTank) return;
    setModalError(null);
    setCalEditingPoint(null);
    setCalDryRunReport(null);
    await refreshTankCalibration(calibratingTank.id, chartId || null);
  };

  const handleUpdateCalibrationChartStatus = async (
    chartId: string,
    nextStatus: 'DRAFT' | 'APPROVED' | 'ACTIVE' | 'ARCHIVED'
  ) => {
    if (!calibratingTank || modalSubmitting) return;
    setModalError(null);
    setModalSubmitting(true);
    try {
      const res = await apiFetch<TankCalibrationChart>(
        `/api/v1/tanks/${calibratingTank.id}/calibration/charts/${chartId}/status`,
        {
          method: 'POST',
          body: JSON.stringify({
            status: nextStatus,
            effectiveFrom: calEffectiveFrom.trim() || null,
            notes: calNotes.trim() || null,
          }),
        }
      );

      if (res.success && res.data) {
        await refreshTankCalibration(calibratingTank.id, res.data.id);
        notifyCalibrationChanged(calibratingTank.id);
        setSuccessMsg(
          `Revision #${res.data.revisionNumber} marked as ${res.data.status} for Tank #${calibratingTank.tankNumber}`
        );
        setTimeout(() => setSuccessMsg(null), 3000);
      } else {
        setModalError(getPumpInfrastructureErrorMessage(res.error));
      }
    } finally {
      setModalSubmitting(false);
    }
  };

  const handleForkCalibrationRevision = async () => {
    if (!calibratingTank || modalSubmitting) return;
    setModalError(null);
    setModalSubmitting(true);
    try {
      const res = (await apiFetch<TankCalibrationChart>(
        `/api/v1/tanks/${calibratingTank.id}/calibration/charts/fork`,
        {
          method: 'POST',
          body: JSON.stringify({
            sourceChartId: calSelectedChart?.id,
            status: 'DRAFT',
            notes: calNotes.trim() || `Forked from Rev #${calSelectedChart?.revisionNumber || 1}`,
          }),
        }
      )) as any;

      if (res.success && res.data) {
        await refreshTankCalibration(calibratingTank.id, res.data.id);
        notifyCalibrationChanged(calibratingTank.id);
        setSuccessMsg(
          `Created editable Draft Revision #${res.data.revisionNumber} for Tank #${calibratingTank.tankNumber}`
        );
        setTimeout(() => setSuccessMsg(null), 3000);
      } else {
        setModalError(getPumpInfrastructureErrorMessage(res.error));
      }
    } finally {
      setModalSubmitting(false);
    }
  };

  const startEditCalibrationPoint = (pt: TankCalibrationPoint) => {
    setCalEditingPoint(pt);
    setCalDipInput(formatCalibrationDisplay(pt.dipMmStr ?? pt.dipMillimetresMilliunits / 1000));
    setCalVolumeInput(formatCalibrationDisplay(pt.volumeLitreStr ?? pt.volumeMilliunits / 1000));
    setModalError(null);
  };

  const cancelEditCalibrationPoint = () => {
    setCalEditingPoint(null);
    setCalDipInput('');
    setCalVolumeInput('');
    setModalError(null);
  };

  const handleSaveCalibrationPoint = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!calibratingTank || modalSubmitting) return;
    setModalError(null);

    const existingPoints =
      calModalPoints.length > 0
        ? calModalPoints
        : tankCalibrationByTankId[calibratingTank.id] || [];
    const maxDipNum = calMaxDipMmInput.trim() ? Number(calMaxDipMmInput) : undefined;
    const diaNum = calDiameterMmInput.trim() ? Number(calDiameterMmInput) : undefined;

    const validation = validateSingleCalibrationPoint(
      { dipMillimetres: calDipInput, volumeLitres: calVolumeInput },
      existingPoints,
      {
        editingPointId: calEditingPoint?.id || null,
        tankCapacityLitres: calibratingTank.capacityLitres,
        allowOverCapacity: calAllowOverCapacity,
        maxDipMm: Number.isFinite(maxDipNum) ? maxDipNum : undefined,
        tankDiameterMm: Number.isFinite(diaNum) ? diaNum : undefined,
      }
    );

    if (!validation.valid || !validation.normalizedPoint) {
      setModalError(validation.error || 'Invalid calibration point values.');
      return;
    }

    setModalSubmitting(true);
    try {
      const isEditing = Boolean(calEditingPoint);
      const endpoint = isEditing
        ? `/api/v1/tanks/${calibratingTank.id}/calibration/${calEditingPoint!.id}`
        : `/api/v1/tanks/${calibratingTank.id}/calibration`;

      const res = await apiFetch<TankCalibrationPoint>(endpoint, {
        method: isEditing ? 'PUT' : 'POST',
        body: JSON.stringify(validation.normalizedPoint),
      });

      if (res.success && res.data) {
        await refreshTankCalibration(calibratingTank.id, res.data.chartId || calSelectedChart?.id || null);
        notifyCalibrationChanged(calibratingTank.id);
        setCalEditingPoint(null);
        setCalDipInput('');
        setCalVolumeInput('');
        setSuccessMsg(
          isEditing
            ? `Calibration point updated for Tank #${calibratingTank.tankNumber}`
            : `Calibration point added for Tank #${calibratingTank.tankNumber}`
        );
        setTimeout(() => setSuccessMsg(null), 3000);
      } else {
        setModalError(getPumpInfrastructureErrorMessage(res.error));
      }
    } finally {
      setModalSubmitting(false);
    }
  };

  const handleDeleteCalibrationPoint = async (point: TankCalibrationPoint) => {
    if (!calibratingTank || modalSubmitting) return;
    setModalError(null);
    setModalSubmitting(true);

    try {
      const res = await apiFetch(
        `/api/v1/tanks/${calibratingTank.id}/calibration/${point.id}`,
        { method: 'DELETE' }
      );
      if (res.success) {
        await refreshTankCalibration(calibratingTank.id, calSelectedChart?.id || null);
        notifyCalibrationChanged(calibratingTank.id);
        if (calEditingPoint?.id === point.id) {
          cancelEditCalibrationPoint();
        }
        setSuccessMsg(
          `Calibration point (${formatCalibrationDisplay(point.dipMmStr)} mm) deleted from Tank #${calibratingTank.tankNumber}`
        );
        setTimeout(() => setSuccessMsg(null), 3000);
      } else {
        setModalError(getPumpInfrastructureErrorMessage(res.error));
      }
    } finally {
      setModalSubmitting(false);
    }
  };

  const handleLoadDummyCalibrationPreset = () => {
    if (!calibratingTank) return;
    setCalShowBulkImport(true);
    setCalShowPreview(true);
    setCalBulkText(formatDummyCalibrationPresetText(calibratingTank.capacityLitres || 20000));
    setCalSourceFileName('uat-5point-preset.csv');
    setModalError(null);
  };

  const handleCalibrationCsvUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setModalError(null);
    try {
      const text = await file.text();
      setCalShowBulkImport(true);
      setCalShowPreview(true);
      setCalBulkText(text);
      setCalSourceFileName(file.name);
    } catch {
      setModalError('Failed to read the selected CSV file.');
    } finally {
      e.target.value = '';
    }
  };

  const handleBulkImportCalibration = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!calibratingTank || modalSubmitting) return;
    setModalError(null);

    const maxDipNum = calMaxDipMmInput.trim() ? Number(calMaxDipMmInput) : undefined;
    const diaNum = calDiameterMmInput.trim() ? Number(calDiameterMmInput) : undefined;
    const lenNum = calLengthMmInput.trim() ? Number(calLengthMmInput) : undefined;

    const parsed = parseBulkCalibrationText(calBulkText, {
      tankCapacityLitres: calibratingTank.capacityLitres,
      allowOverCapacity: calAllowOverCapacity,
      maxDipMm: Number.isFinite(maxDipNum) ? maxDipNum : undefined,
      tankDiameterMm: Number.isFinite(diaNum) ? diaNum : undefined,
    });

    if (!parsed.valid) {
      setModalError(parsed.error || 'Invalid bulk calibration data.');
      return;
    }

    setModalSubmitting(true);
    try {
      const metadataPayload: Record<string, any> = {
        chartUnitDip: 'MM',
        chartUnitVolume: 'LITRE',
      };
      if (Number.isFinite(diaNum) && diaNum! > 0) {
        metadataPayload.tankDiameterMm = diaNum!.toFixed(3);
      }
      if (Number.isFinite(lenNum) && lenNum! > 0) {
        metadataPayload.tankLengthMm = lenNum!.toFixed(3);
      }
      if (Number.isFinite(maxDipNum) && maxDipNum! > 0) {
        metadataPayload.maxDipMm = maxDipNum!.toFixed(3);
      }
      if (calSourceFileName.trim()) {
        metadataPayload.sourceFileName = calSourceFileName.trim();
      }
      if (calReferenceDocument.trim()) {
        metadataPayload.referenceDocument = calReferenceDocument.trim();
      }
      if (calEffectiveFrom.trim()) {
        metadataPayload.effectiveFrom = calEffectiveFrom.trim();
      }
      if (calNotes.trim()) {
        metadataPayload.notes = calNotes.trim();
      }

      const effectiveSaveMode = canApproveCalibrationChart ? calSaveMode : 'DRAFT';
      const res = (await apiFetch<TankCalibrationPoint[]>(
        `/api/v1/tanks/${calibratingTank.id}/calibration/bulk`,
        {
          method: 'POST',
          body: JSON.stringify({
            points: parsed.normalizedPoints,
            metadata: metadataPayload,
            activateImmediately: effectiveSaveMode === 'ACTIVE',
            saveMode: effectiveSaveMode,
            allowOverCapacity: calAllowOverCapacity,
            chartId: calSelectedChart && !calSelectedChart.isReferenced ? calSelectedChart.id : undefined,
          }),
        }
      )) as any;

      if (res.success && res.data) {
        const importedChart: TankCalibrationChart | null = res.chart ?? null;
        await refreshTankCalibration(calibratingTank.id, importedChart?.id || null);
        notifyCalibrationChanged(calibratingTank.id);
        setCalShowBulkImport(false);
        setCalShowPreview(false);
        setCalBulkText('');
        setSuccessMsg(
          importedChart
            ? `Saved ${res.data.length} points in Revision #${importedChart.revisionNumber} (${importedChart.status}) for Tank #${calibratingTank.tankNumber}`
            : `Imported ${res.data.length} calibration points for Tank #${calibratingTank.tankNumber}`
        );
        setTimeout(() => setSuccessMsg(null), 3500);
      } else {
        setModalError(getPumpInfrastructureErrorMessage(res.error));
      }
    } finally {
      setModalSubmitting(false);
    }
  };

  const handleLoadSampleDryRunCheckpoints = () => {
    if (!calibratingTank) return;
    setModalError(null);
    const sourcePts =
      calDryRunSource === 'CSV_PREVIEW' && calBulkText.trim()
        ? parseBulkCalibrationText(calBulkText, {
            tankCapacityLitres: calibratingTank.capacityLitres,
            allowOverCapacity: true,
          }).normalizedPoints
        : calModalPoints.length > 0
          ? calModalPoints
          : tankCalibrationByTankId[calibratingTank.id] || [];
    setCalDryRunText(buildSampleDryRunCheckpointsText(sourcePts));
  };

  const handleDryRunCsvUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setModalError(null);
    try {
      const text = await file.text();
      setCalDryRunText(text);
    } catch {
      setModalError('Failed to read the selected reference checkpoints CSV file.');
    } finally {
      e.target.value = '';
    }
  };

  const handleRunDryRunComparison = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!calibratingTank || modalSubmitting) return;
    setModalError(null);

    const parsedCp = parseDryRunCheckpointsText(calDryRunText);
    if (!parsedCp.valid) {
      setModalError(parsedCp.error || 'Invalid dry-run checkpoints.');
      return;
    }

    const tolNum = Number(calDryRunTolerance);
    const toleranceLitres = Number.isFinite(tolNum) && tolNum >= 0 ? tolNum : 0.5;

    // If comparing against unsaved CSV preview, evaluate using candidate points
    let candidatePoints: Array<{ dipMillimetres: string; volumeLitres: string }> | undefined;
    if (calDryRunSource === 'CSV_PREVIEW') {
      const parsedPreview = parseBulkCalibrationText(calBulkText, {
        tankCapacityLitres: calibratingTank.capacityLitres,
        allowOverCapacity: true,
      });
      if (!parsedPreview.valid) {
        setModalError(parsedPreview.error || 'Please provide valid CSV preview points first.');
        return;
      }
      candidatePoints = parsedPreview.normalizedPoints;
    }

    setModalSubmitting(true);
    try {
      const res = await apiFetch<TankCalibrationDryRunReport>(
        `/api/v1/tanks/${calibratingTank.id}/calibration/dry-run`,
        {
          method: 'POST',
          body: JSON.stringify({
            chartId: calDryRunSource === 'SAVED_CHART' ? calSelectedChart?.id : undefined,
            candidatePoints,
            checkpoints: parsedCp.checkpoints,
            toleranceLitres: toleranceLitres.toFixed(3),
          }),
        }
      );

      if (res.success && res.data) {
        setCalDryRunReport(res.data);
      } else {
        // Fallback to client-side dry-run evaluator if offline or preview-only
        const ptsToUse = candidatePoints || calModalPoints;
        setCalDryRunReport(
          evaluateCalibrationDryRunClient(ptsToUse, parsedCp.checkpoints, toleranceLitres)
        );
      }
    } finally {
      setModalSubmitting(false);
    }
  };

  const handleAddShift = async (e: React.FormEvent) => {
    e.preventDefault();
    if (modalSubmitting) return;
    setModalSubmitting(true);
    setModalError(null);

    try {
      const res = await apiFetch('/api/v1/shift-templates', {
        method: 'POST',
        body: JSON.stringify({
          code: shiftCode.trim().toUpperCase(),
          name: shiftName.trim(),
          startTime: shiftStart,
          endTime: shiftEnd,
          sequence: Number(shiftSeq),
          status: 'ACTIVE',
        }),
      });

      if (res.success) {
        setModalType(null);
        setSuccessMsg('Global shift template registered');
        setTimeout(() => setSuccessMsg(null), 3000);
        loadOutletData();
      } else {
        setModalError(res.error?.message || 'Failed to create shift template');
      }
    } finally {
      setModalSubmitting(false);
    }
  };

  const openEditShift = (s: ShiftTemplate) => {
    setEditingShift(s);
    setEditShiftName(s.name);
    setEditShiftStart(s.startTime);
    setEditShiftEnd(s.endTime);
    setEditShiftSeq(s.sequence);
    setEditShiftStatus((s.status as any) || 'ACTIVE');
    setModalError(null);
    setModalType('editShift');
  };

  const handleEditShift = async (e: React.FormEvent) => {
    e.preventDefault();
    if (modalSubmitting || !editingShift) return;
    setModalSubmitting(true);
    setModalError(null);

    try {
      const res = await apiFetch(`/api/v1/shift-templates/${editingShift.id}`, {
        method: 'PUT',
        body: JSON.stringify({
          name: editShiftName.trim(),
          startTime: editShiftStart,
          endTime: editShiftEnd,
          sequence: Number(editShiftSeq),
          status: editShiftStatus,
        }),
      });

      if (res.success) {
        setModalType(null);
        setEditingShift(null);
        setSuccessMsg(`Shift template ${editingShift.code} updated successfully`);
        setTimeout(() => setSuccessMsg(null), 3000);
        loadOutletData();
      } else {
        setModalError(res.error?.message || 'Failed to update shift template');
      }
    } finally {
      setModalSubmitting(false);
    }
  };

  const handleToggleShiftStatus = async (s: ShiftTemplate) => {
    const nextStatus = s.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE';
    try {
      const res = await apiFetch(`/api/v1/shift-templates/${s.id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: nextStatus }),
      });
      if (res.success) {
        setSuccessMsg(`Shift template ${s.code} is now ${nextStatus}`);
        setTimeout(() => setSuccessMsg(null), 3000);
        loadOutletData();
      } else {
        setError(res.error?.message || 'Failed to update shift template status');
      }
    } catch (err: any) {
      setError(err?.message || 'Error updating shift template status');
    }
  };

  if (loadingOutlets) {
    return (
      <div className="py-16 text-center text-[#64748B] text-sm font-mono flex items-center justify-center gap-2">
        <RefreshCw className="w-4 h-4 animate-spin text-orange-500" />
        Loading accessible retail outlets...
      </div>
    );
  }

  if (outlets.length === 0) {
    return (
      <div className="p-8 text-center bg-white border border-[#E2E8F0] rounded-2xl">
        <Building2 className="w-12 h-12 text-slate-600 mx-auto mb-3" />
        <h2 className="text-base font-bold text-[#17365D]">No Retail Outlets In Your Scope</h2>
        <p className="text-xs text-[#64748B] mt-1">You do not have scope access to manage retail outlets.</p>
      </div>
    );
  }

  return (
    <div className="admin-modern space-y-6 pb-10">
      {/* Top Header & Outlet Selector */}
      <div className="bg-white border border-[#E2E8F0]/80 rounded-2xl p-5 shadow-sm shadow-black/20">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <Building2 className="w-5 h-5 text-orange-500" />
              <h1 className="text-xl font-black text-[#17365D] tracking-tight">
                Pump Operations Infrastructure
              </h1>
            </div>
            <p className="text-xs text-[#64748B] mt-1">
              Configure Tanks, Multi-Product Dispensers, Nozzles, and Shift Timing for your outlet
            </p>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-xs font-mono font-semibold text-[#64748B]">Select Outlet:</span>
            <select
              value={selectedOutletId}
              onChange={(e) => setSelectedOutletId(e.target.value)}
              className="bg-[#F1F5F9] border border-[#D7E0EA] text-[#17365D] rounded-xl px-3 py-2 text-xs sm:text-sm font-semibold focus:outline-none focus:border-orange-500"
            >
              {outlets.map(o => (
                <option key={o.id} value={o.id}>
                  {o.roCode} — {o.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Selected Outlet Summary Strip */}
        {selectedOutlet && (
          <div className="mt-4 pt-4 border-t border-[#E2E8F0]/80 flex flex-wrap items-center gap-4 text-xs font-mono">
            <div className="flex items-center gap-1.5 text-[#475569]">
              <span className="text-[#64748B]">TYPE:</span>
              <span className="font-bold text-[#B8530D]">{selectedOutlet.outletType}</span>
            </div>
            <div className="flex items-center gap-1.5 text-[#475569]">
              <MapPin className="w-3.5 h-3.5 text-[#64748B]" />
              <span>{selectedOutlet.city}, {selectedOutlet.district}</span>
            </div>
            <div className="flex items-center gap-1.5 text-[#475569]">
              <span className="text-[#64748B]">PIN:</span>
              <span>{selectedOutlet.pincode}</span>
            </div>
            <div className="ml-auto flex items-center gap-2">
              <button
                onClick={loadOutletData}
                className="flex items-center gap-1 text-[11px] text-[#64748B] hover:text-[#17365D] px-2 py-1 rounded bg-[#F1F5F9] border border-[#D7E0EA]"
              >
                <RefreshCw className={`w-3 h-3 ${loadingData ? 'animate-spin text-orange-500' : ''}`} />
                <span>Reload</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Notifications */}
      {successMsg && (
        <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-700 text-xs sm:text-sm flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}
      {error && (
        <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-700 text-xs sm:text-sm flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Sub-tab Navigation */}
      <div className="flex items-center gap-1 border-b border-[#E2E8F0] pb-2 overflow-x-auto">
        <button
          onClick={() => setActiveTab('products')}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
            activeTab === 'products'
              ? 'bg-orange-500 text-white shadow-md shadow-orange-500/20'
              : 'text-[#64748B] hover:text-[#17365D] hover:bg-white'
          }`}
        >
          <Fuel className="w-3.5 h-3.5" />
          <span>Mapped Products ({outletProducts.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('tanks')}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
            activeTab === 'tanks'
              ? 'bg-orange-500 text-white shadow-md shadow-orange-500/20'
              : 'text-[#64748B] hover:text-[#17365D] hover:bg-white'
          }`}
        >
          <Gauge className="w-3.5 h-3.5" />
          <span>Underground Tanks ({tanks.length})</span>
        </button>

        {canReadTankCalibration && (
          <button
            onClick={() => setActiveTab('globalCalibration')}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
              activeTab === 'globalCalibration'
                ? 'bg-orange-500 text-white shadow-md shadow-orange-500/20'
                : 'text-[#64748B] hover:text-[#17365D] hover:bg-white'
            }`}
            data-testid="tab-global-calibration-masters"
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Global Calibration Masters</span>
          </button>
        )}

        <button
          onClick={() => setActiveTab('dispensers')}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
            activeTab === 'dispensers'
              ? 'bg-orange-500 text-white shadow-md shadow-orange-500/20'
              : 'text-[#64748B] hover:text-[#17365D] hover:bg-white'
          }`}
        >
          <Sliders className="w-3.5 h-3.5" />
          <span>Dispensers / MPDs ({dispensers.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('nozzles')}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
            activeTab === 'nozzles'
              ? 'bg-orange-500 text-white shadow-md shadow-orange-500/20'
              : 'text-[#64748B] hover:text-[#17365D] hover:bg-white'
          }`}
        >
          <Flame className="w-3.5 h-3.5" />
          <span>Nozzles ({nozzles.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('fuelMapping')}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
            activeTab === 'fuelMapping'
              ? 'bg-orange-500 text-white shadow-md shadow-orange-500/20'
              : 'text-[#64748B] hover:text-[#17365D] hover:bg-white'
          }`}
        >
          <Network className="w-3.5 h-3.5" />
          <span>Fuel Mapping</span>
        </button>

        <button
          onClick={() => setActiveTab('shifts')}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
            activeTab === 'shifts'
              ? 'bg-orange-500 text-white shadow-md shadow-orange-500/20'
              : 'text-[#64748B] hover:text-[#17365D] hover:bg-white'
          }`}
        >
          <Clock className="w-3.5 h-3.5" />
          <span>Shift Templates ({shiftTemplates.length})</span>
        </button>
      </div>

      {/* TAB CONTENT */}

      {/* 1. MAPPED PRODUCTS */}
      {activeTab === 'products' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-[#17365D] uppercase tracking-wider font-mono">
              Retail Outlet Fuel Products
            </h2>
            {canWriteProducts && (
              <button
                onClick={() => {
                  setSelectedProductId(catalogProducts[0]?.id || '');
                  setModalError(null);
                  setModalType('mapProduct');
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-orange-500 to-amber-600 text-[#17365D] rounded-lg text-xs font-bold shadow-md shadow-orange-500/20"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Map New Product</span>
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {outletProducts.map(op => (
              <div key={op.id} className="bg-white border border-[#E2E8F0] rounded-2xl p-4 flex items-center justify-between">
                <div>
                  <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-[#F1F5F9] text-[#B8530D] border border-[#D7E0EA]">
                    {op.product?.code || 'FUEL'}
                  </span>
                  <div className="text-sm font-bold text-[#17365D] mt-2">
                    {op.product?.name || 'Product'}
                  </div>
                  <div className="text-xs text-[#64748B] font-mono mt-0.5">
                    Unit: {op.product?.unit} • Category: {op.product?.category}
                  </div>
                </div>
                <div className="flex flex-col items-end">
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold border bg-emerald-500/10 text-emerald-700 border-emerald-500/20">
                    Active
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 2A. GLOBAL CALIBRATION MASTERS */}
      {activeTab === 'globalCalibration' && canReadTankCalibration && (
        <GlobalCalibrationMasterSection
          selectedOutletId={selectedOutletId}
          selectedOutletName={
            selectedOutlet ? `${selectedOutlet.roCode} — ${selectedOutlet.name}` : undefined
          }
          canWriteTankCalibration={canWriteTankCalibration}
          canApproveCalibrationChart={canApproveCalibrationChart}
          onCalibrationAssigned={() => {
            loadOutletData();
          }}
        />
      )}

      {/* 2. UNDERGROUND TANKS */}
      {activeTab === 'tanks' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-bold text-[#17365D] uppercase tracking-wider font-mono">
              Underground Storage Tanks (UST)
            </h2>
            <div className="flex flex-wrap items-center gap-2">
              {canReadTankCalibration && (
                <button
                  type="button"
                  onClick={() => setActiveTab('globalCalibration')}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-[#F1F5F9] hover:bg-[#E8EEF5] text-orange-800 border border-orange-500/30 rounded-lg text-xs font-mono font-bold transition-colors"
                >
                  <Layers className="w-3.5 h-3.5 text-[#B8530D]" />
                  <span>Global Calibration Masters (20 KL / 50 KL)</span>
                </button>
              )}
              {canWriteTanks && (
                <button
                  onClick={() => {
                    setTankNumber(tanks.length + 1);
                    setTankName(`Tank ${tanks.length + 1}`);
                    setSelectedProductId(outletProducts[0]?.productId || '');
                    setTankCapacity(20000);
                    setTankSafeFill(19000);
                    setTankMinOperating(1000);
                    setModalError(null);
                    setModalType('addTank');
                  }}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-orange-500 to-amber-600 text-[#17365D] rounded-lg text-xs font-bold shadow-md shadow-orange-500/20"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Add Storage Tank</span>
                </button>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {tanks.map(t => {
              const safeFillPercent = Math.min(100, Math.round((t.safeFillCapacityLitres / t.capacityLitres) * 100));
              const calPoints = tankCalibrationByTankId[t.id] || [];
              const calStatus = getTankCalibrationStatus(calPoints.length);

              return (
                <div key={t.id} className="bg-white border border-[#E2E8F0] rounded-2xl p-5 space-y-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 rounded bg-[#F1F5F9] text-[#B8530D] font-mono text-xs font-bold border border-[#D7E0EA]">
                          Tank #{t.tankNumber}
                        </span>
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/10 text-amber-700 border border-amber-500/20">
                          {t.productCode || t.productName}
                        </span>
                      </div>
                      <h3 className="text-base font-bold text-[#17365D] mt-1.5">{t.name}</h3>
                    </div>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold border bg-emerald-500/10 text-emerald-700 border-emerald-500/20">
                      {t.status}
                    </span>
                  </div>

                  {/* Visual Safe Fill Capacity Meter */}
                  <div>
                    <div className="flex justify-between text-xs text-[#64748B] font-mono mb-1">
                      <span>Safe Fill Limit: {t.safeFillCapacityLitres.toLocaleString()} L</span>
                      <span>Total: {t.capacityLitres.toLocaleString()} L</span>
                    </div>
                    <div className="w-full bg-[#F1F5F9] rounded-full h-3 overflow-hidden border border-[#D7E0EA]/80">
                      <div
                        className="bg-gradient-to-r from-blue-500 to-amber-500 h-full rounded-full"
                        style={{ width: `${safeFillPercent}%` }}
                      />
                    </div>
                  </div>

                  <div className="pt-2 border-t border-[#E2E8F0] grid grid-cols-2 gap-2 text-xs font-mono">
                    <div>
                      <span className="text-[#64748B] block text-[10px]">MIN OPERATING LEVEL</span>
                      <span className="text-[#334155]">{t.minimumOperatingLevelLitres.toLocaleString()} Litres</span>
                    </div>
                    <div>
                      <span className="text-[#64748B] block text-[10px]">COMMISSIONED</span>
                      <span className="text-[#334155]">{t.commissionedAt ? new Date(t.commissionedAt).toLocaleDateString() : 'N/A'}</span>
                    </div>
                  </div>

                  {/* Tank Calibration Status Badge */}
                  <div className="pt-2 border-t border-[#E2E8F0]/80 space-y-1.5">
                    <div className="flex items-center justify-between text-xs font-mono">
                      <span className="text-[#64748B]">Calibration:</span>
                      <span
                        className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold border inline-flex items-center gap-1.5 ${calStatus.badgeClass}`}
                      >
                        {calStatus.isConfigured ? (
                          <CheckCircle className="w-3 h-3 shrink-0" />
                        ) : (
                          <AlertTriangle className="w-3 h-3 shrink-0" />
                        )}
                        <span>{calStatus.badgeLabel}</span>
                      </span>
                    </div>
                    {!calStatus.isConfigured && calStatus.warningText && (
                      <div className="px-2.5 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-[11px] text-amber-800 font-mono flex items-center gap-1.5">
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-700 shrink-0" />
                        <span>{calStatus.warningText}</span>
                      </div>
                    )}
                  </div>

                  {(canReadTankCalibration || canWriteTanks) && (
                    <div className="pt-2 border-t border-[#E2E8F0]/80 flex items-center gap-2">
                      {canReadTankCalibration && (
                        <button
                          type="button"
                          onClick={() => openCalibrationModal(t)}
                          className="flex-1 flex items-center justify-center gap-1.5 py-1.5 bg-[#F1F5F9]/80 hover:bg-[#E8EEF5]/80 text-[#B8530D] hover:text-orange-800 border border-[#D7E0EA]/80 rounded-xl text-xs font-semibold transition-colors"
                        >
                          <Layers className="w-3.5 h-3.5" />
                          <span>Calibration Chart</span>
                        </button>
                      )}
                      {canWriteTanks && (
                        <button
                          type="button"
                          onClick={() => openEditTank(t)}
                          className="flex-1 flex items-center justify-center gap-1.5 py-1.5 bg-[#F1F5F9]/80 hover:bg-[#E8EEF5]/80 text-[#475569] hover:text-[#17365D] rounded-xl text-xs font-semibold transition-colors"
                        >
                          <Edit2 className="w-3.5 h-3.5 text-[#B8530D]" />
                          <span>Edit Tank</span>
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 3. DISPENSERS */}
      {activeTab === 'dispensers' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-[#17365D] uppercase tracking-wider font-mono">
              Multi-Product Dispenser Units (MPD)
            </h2>
            {canWriteDispensers && (
              <button
                onClick={() => {
                  setDispNumber(dispensers.length + 1);
                  setDispName(`MPD Unit ${dispensers.length + 1}`);
                  setDispManufacturer('Wayne Dresser');
                  setDispModel('Helix 5000');
                  setDispSerial('');
                  setModalError(null);
                  setModalType('addDispenser');
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-orange-500 to-amber-600 text-[#17365D] rounded-lg text-xs font-bold shadow-md shadow-orange-500/20"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Dispenser</span>
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {dispensers.map(d => (
              <div key={d.id} className="bg-white border border-[#E2E8F0] rounded-2xl p-5 space-y-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <span className="px-2.5 py-1 rounded bg-[#F1F5F9] text-[#B8530D] font-mono text-xs font-bold border border-[#D7E0EA]">
                      MPD #{d.dispenserNumber}
                    </span>
                    <span className="px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 font-mono text-[10px] font-bold border border-blue-500/20">
                      {d.nozzleCapacity || 6}-Nozzle DU
                    </span>
                  </div>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold border bg-emerald-500/10 text-emerald-700 border-emerald-500/20">
                    {d.status}
                  </span>
                </div>

                <div>
                  <h3 className="text-sm font-bold text-[#17365D]">{d.name}</h3>
                  <div className="text-xs text-[#64748B] mt-0.5">
                    {d.manufacturer || 'Standard'} {d.model && `• ${d.model}`}
                  </div>
                </div>

                <div className="pt-2 border-t border-[#E2E8F0] grid grid-cols-2 gap-2 text-xs font-mono">
                  <div>
                    <span className="text-[#64748B] block text-[10px]">SERIAL NO.</span>
                    <span className="text-[#475569] font-bold truncate block">{d.serialNumber || 'N/A'}</span>
                  </div>
                  <div>
                    <span className="text-[#64748B] block text-[10px]">CONNECTED NOZZLES</span>
                    <span className="text-[#B8530D] font-bold">
                      {d.nozzlesCount || 0} / {d.nozzleCapacity || 6}
                    </span>
                  </div>
                </div>

                {canWriteDispensers && (
                  <div className="pt-2 border-t border-[#E2E8F0]/80">
                    <button
                      onClick={() => openEditDispenser(d)}
                      className="w-full flex items-center justify-center gap-1.5 py-1.5 bg-[#F1F5F9]/80 hover:bg-[#E8EEF5]/80 text-[#475569] hover:text-[#17365D] rounded-xl text-xs font-semibold transition-colors"
                    >
                      <Edit2 className="w-3.5 h-3.5 text-[#B8530D]" />
                      <span>Configure DU</span>
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 4. NOZZLES */}
      {activeTab === 'nozzles' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-[#17365D] uppercase tracking-wider font-mono">
              Fuel Delivery Nozzles
            </h2>
            {canWriteNozzles && (
              <button
                onClick={() => openAddNozzleModal()}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-orange-500 to-amber-600 text-[#17365D] rounded-lg text-xs font-bold shadow-md shadow-orange-500/20"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Configure Nozzle</span>
              </button>
            )}
          </div>

          {nozzleDiagnostics && nozzleDiagnostics.orphanNozzlesCount > 0 && (
            <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-2xl space-y-2">
              <div className="flex items-center gap-2 text-amber-700 text-xs font-bold font-mono">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>
                  HIDDEN / ORPHAN NOZZLE TOPOLOGY DETECTED ({nozzleDiagnostics.orphanNozzlesCount})
                </span>
              </div>
              <div className="space-y-2">
                {nozzleDiagnostics.orphanNozzles.map((orp: NozzleDiagnosticItem) => (
                  <div
                    key={orp.id}
                    className="flex flex-wrap items-center justify-between gap-2 bg-white/80 border border-[#E2E8F0] rounded-xl px-3 py-2 text-xs font-mono"
                  >
                    <div className="text-[#475569]">
                      <span className="font-bold text-amber-700">
                        MPD #{orp.dispenserNumber || '?'} / Nozzle {orp.nozzleNumber}
                      </span>{' '}
                      • Status: <span className="text-rose-700">{orp.integrityStatus}</span>{' '}
                      {orp.brokenRelations?.length > 0 && `(${orp.brokenRelations.join(', ')})`}
                    </div>
                    {canWriteNozzles && (
                      <button
                        onClick={() => openAddNozzleModal(orp.dispenserId, orp.nozzleNumber)}
                        className="px-2.5 py-1 bg-orange-500 hover:bg-orange-600 text-white rounded-lg text-[11px] font-bold"
                      >
                        Repair Nozzle #{orp.nozzleNumber}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {canWriteNozzles && dispensers.some(d => {
            const duNozzles = nozzles.filter(n => n.dispenserId === d.id);
            return getAvailableNozzleNumbers(d.nozzleCapacity, duNozzles).length > 0;
          }) && (
            <div className="p-3.5 bg-white/90 border border-[#E2E8F0] rounded-2xl flex flex-wrap items-center gap-2 text-xs">
              <span className="text-[#64748B] font-mono text-[11px] mr-1">Unconfigured DU Positions:</span>
              {dispensers.map(d => {
                const duNozzles = nozzles.filter(n => n.dispenserId === d.id);
                const missingNums = getAvailableNozzleNumbers(d.nozzleCapacity, duNozzles);
                return missingNums.map(num => (
                  <button
                    key={`${d.id}-${num}`}
                    onClick={() => openAddNozzleModal(d.id, num)}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#F1F5F9] hover:bg-[#E8EEF5] text-[#B8530D] border border-[#D7E0EA] font-mono text-[11px] font-bold transition-colors"
                  >
                    <Plus className="w-3 h-3" />
                    <span>MPD #{d.dispenserNumber} / Nozzle {num}</span>
                  </button>
                ));
              })}
            </div>
          )}

          <div className="overflow-x-auto bg-white border border-[#E2E8F0] rounded-2xl">
            <table className="admin-data-table w-full text-left text-xs">
              <thead className="bg-[#F1F5F9]/60 text-[#64748B] font-mono uppercase text-[10px] border-b border-[#E2E8F0]">
                <tr>
                  <th className="py-3 px-4">DU / MPD</th>
                  <th className="py-3 px-4">Nozzle #</th>
                  <th className="py-3 px-4">Fuel Product</th>
                  <th className="py-3 px-4">Connected Tank</th>
                  <th className="py-3 px-4">Status</th>
                  <th className="py-3 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {nozzles.map(n => (
                  <tr key={n.id} className="hover:bg-[#F1F5F9]/30 transition-colors">
                    <td className="py-3 px-4 font-medium text-[#17365D]">
                      MPD #{n.dispenserNumber} ({n.dispenserName || `DU #${n.dispenserNumber}`})
                    </td>
                    <td className="py-3 px-4 font-mono font-bold text-[#B8530D]">
                      Nozzle {n.nozzleNumber}
                    </td>
                    <td className="py-3 px-4">
                      <span className="px-2 py-0.5 rounded font-mono font-bold bg-amber-500/10 text-amber-700 border border-amber-500/20">
                        {n.productCode || n.productName}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-[#475569] font-mono">
                      Tank #{n.tankNumber} ({n.tankName || `Tank #${n.tankNumber}`})
                    </td>
                    <td className="py-3 px-4">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                        n.status === 'ACTIVE'
                          ? 'bg-emerald-500/10 text-emerald-700 border-emerald-500/20'
                          : n.status === 'MAINTENANCE'
                          ? 'bg-amber-500/10 text-amber-700 border-amber-500/20'
                          : 'bg-[#F1F5F9] text-[#64748B] border-[#D7E0EA]'
                      }`}>
                        {n.status}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      {canWriteNozzles ? (
                        <button
                          onClick={() => openEditNozzle(n)}
                          className="inline-flex items-center gap-1.5 px-3 py-1 bg-[#F1F5F9] hover:bg-[#E8EEF5] text-[#B8530D] hover:text-orange-800 border border-[#D7E0EA] rounded-lg text-xs font-semibold transition-colors"
                        >
                          <Edit2 className="w-3 h-3" />
                          <span>Edit Mapping</span>
                        </button>
                      ) : (
                        <span className="text-[11px] text-[#64748B] italic">Read-only</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 5. GLOBAL SHIFT MASTER */}
      {activeTab === 'shifts' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-sm font-bold text-[#17365D] uppercase tracking-wider font-mono">
                Global Shift Master
              </h2>
              <p className="text-xs text-[#64748B] mt-0.5">
                Centrally defined shift definitions shared across all retail outlets ({shiftTemplates.length} templates)
              </p>
            </div>
            {canWriteShifts && (
              <button
                onClick={() => {
                  setShiftCode(`SHIFT_${shiftTemplates.length + 1}`);
                  setShiftName(`Shift ${shiftTemplates.length + 1}`);
                  setShiftStart('06:00');
                  setShiftEnd('14:00');
                  setShiftSeq(shiftTemplates.length + 1);
                  setModalError(null);
                  setModalType('addShift');
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-orange-500 to-amber-600 text-[#17365D] rounded-lg text-xs font-bold shadow-md shadow-orange-500/20"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Shift Template</span>
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {shiftTemplates.map(s => {
              const isOvernight = s.startTime > s.endTime;
              const isActive = s.status === 'ACTIVE';
              return (
                <div key={s.id} className="bg-white border border-[#E2E8F0] rounded-2xl p-5 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded font-mono font-bold text-[#B8530D] bg-[#F1F5F9] border border-[#D7E0EA] text-xs">
                        {s.code}
                      </span>
                      {isOvernight && (
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                          Overnight
                        </span>
                      )}
                    </div>
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                        isActive
                          ? 'bg-emerald-500/10 text-emerald-700 border-emerald-500/20'
                          : 'bg-rose-500/10 text-rose-700 border-rose-500/20'
                      }`}
                    >
                      {s.status || 'ACTIVE'}
                    </span>
                  </div>
                  <h3 className="text-base font-bold text-[#17365D]">{s.name}</h3>
                  <div className="pt-2 border-t border-[#E2E8F0] flex items-center justify-between text-xs font-mono text-[#475569]">
                    <div className="flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-[#B8530D]" />
                      <span>{s.startTime} → {s.endTime}</span>
                    </div>
                    <span className="text-[#64748B]">Seq #{s.sequence}</span>
                  </div>

                  {canWriteShifts && (
                    <div className="pt-2 border-t border-[#E2E8F0]/80 flex items-center gap-2">
                      <button
                        onClick={() => openEditShift(s)}
                        className="flex-1 flex items-center justify-center gap-1.5 py-1.5 bg-[#F1F5F9] hover:bg-[#E8EEF5] text-[#475569] hover:text-[#17365D] rounded-xl text-xs font-semibold transition"
                      >
                        <Edit2 className="w-3.5 h-3.5 text-[#B8530D]" />
                        <span>Edit Shift</span>
                      </button>
                      <button
                        onClick={() => handleToggleShiftStatus(s)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition ${
                          isActive
                            ? 'bg-rose-500/10 text-rose-700 border-rose-500/20 hover:bg-rose-500/20'
                            : 'bg-emerald-500/10 text-emerald-700 border-emerald-500/20 hover:bg-emerald-500/20'
                        }`}
                      >
                        {isActive ? 'Deactivate' : 'Activate'}
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 6. FUEL MAPPING TOPOLOGY TAB */}
      {activeTab === 'fuelMapping' && (() => {
        const mappingTree = buildFuelMappingTree(catalogProducts, outletProducts, tanks, dispensers, nozzles);

        return (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-bold text-[#17365D] uppercase tracking-wider font-mono flex items-center gap-2">
                  <Network className="w-4 h-4 text-[#B8530D]" />
                  <span>Physical Fuel Topology Tree (PRODUCT → TANK → DU → NOZZLE)</span>
                </h2>
                <p className="text-xs text-[#64748B] mt-1">
                  Hierarchical physical mapping derived from active tanks, DUs, and configured nozzles.
                </p>
              </div>
            </div>

            {/* Warnings Summary Panel */}
            {mappingTree.warningsSummary.length > 0 && (
              <div className="bg-amber-500/10 border border-amber-500/20 rounded-2xl p-4 space-y-2">
                <div className="flex items-center gap-2 text-amber-700 text-xs font-bold font-mono">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>TOPOLOGY AUDIT WARNINGS ({mappingTree.warningsSummary.length})</span>
                </div>
                <ul className="list-disc list-inside space-y-1 text-xs text-amber-800/80 font-mono">
                  {mappingTree.warningsSummary.map((warn, idx) => (
                    <li key={idx}>{warn}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Product Mapping Nodes */}
            <div className="space-y-6">
              {mappingTree.products.map(pNode => (
                <div key={pNode.product.id} className="bg-white border border-[#E2E8F0] rounded-2xl p-5 space-y-4">
                  {/* Product Header */}
                  <div className="flex items-center justify-between pb-3 border-b border-[#E2E8F0]">
                    <div className="flex items-center gap-3">
                      <span className={`px-2.5 py-1 rounded font-mono text-xs font-bold border ${getProductCategoryBadgeClass(pNode.product.category)}`}>
                        {pNode.product.code}
                      </span>
                      <div>
                        <h3 className="text-sm font-bold text-[#17365D]">{pNode.product.name}</h3>
                        <span className="text-[10px] text-[#64748B] font-mono">Category: {pNode.product.category} • Unit: {pNode.product.unit}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 font-mono text-xs">
                      <span className="text-[#64748B]">Tanks: <strong className="text-[#334155]">{pNode.totalTanksCount}</strong></span>
                      <span className="text-[#64748B]">Nozzles: <strong className="text-[#B8530D]">{pNode.totalNozzlesCount}</strong></span>
                    </div>
                  </div>

                  {/* Product Node Warnings */}
                  {pNode.warnings.map((w, idx) => (
                    <div key={idx} className="p-3 bg-amber-500/10 border border-amber-500/20 text-amber-700 text-xs rounded-xl font-mono flex items-center gap-2">
                      <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                      <span>{w}</span>
                    </div>
                  ))}

                  {/* Tanks under Product */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pl-2 border-l-2 border-[#E2E8F0]">
                    {pNode.tanks.map(tNode => (
                      <div key={tNode.tank.id} className="bg-[#F8FAFC]/60 border border-[#E2E8F0]/80 rounded-xl p-4 space-y-3">
                        <div className="flex items-start justify-between">
                          <div>
                            <span className="px-2 py-0.5 rounded bg-[#F1F5F9] text-[#B8530D] font-mono text-[10px] font-bold border border-[#D7E0EA]">
                              Tank #{tNode.tank.tankNumber}
                            </span>
                            <h4 className="text-xs font-bold text-[#17365D] mt-1">{tNode.tank.name}</h4>
                          </div>
                          <span className="px-1.5 py-0.5 rounded-full text-[9px] font-bold border bg-emerald-500/10 text-emerald-700 border-emerald-500/20">
                            {tNode.tank.status}
                          </span>
                        </div>

                        <div className="text-[10px] font-mono text-[#64748B] flex justify-between">
                          <span>Safe Fill: {tNode.tank.safeFillCapacityLitres.toLocaleString()} L</span>
                          <span>Cap: {tNode.tank.capacityLitres.toLocaleString()} L</span>
                        </div>

                        {/* Tank Warnings */}
                        {tNode.warnings.map((w, idx) => (
                          <div key={idx} className="p-2 bg-amber-500/10 border border-amber-500/20 text-amber-700 text-[10px] font-mono rounded-lg">
                            ⚠️ {w}
                          </div>
                        ))}

                        {/* DUs connected to Tank */}
                        {tNode.connectedDus.length > 0 && (
                          <div className="space-y-2 pt-2 border-t border-[#E2E8F0]/60">
                            <span className="text-[10px] font-bold text-[#64748B] uppercase tracking-wider font-mono">Connected Dispensing Units</span>
                            {tNode.connectedDus.map(duNode => (
                              <div key={duNode.dispenser.id} className="bg-white border border-[#E2E8F0] rounded-lg p-3 space-y-2">
                                <div className="flex items-center justify-between text-xs">
                                  <div className="flex items-center gap-1.5">
                                    <span className="font-mono font-bold text-[#334155]">DU #{duNode.dispenser.dispenserNumber}</span>
                                    <span className="text-[10px] font-mono text-blue-400 bg-blue-500/10 px-1.5 py-0.5 rounded border border-blue-500/20">
                                      {duNode.duTypeLabel}
                                    </span>
                                  </div>
                                  <span className="text-[10px] font-mono text-[#64748B]">
                                    {duNode.utilization.ratioText}
                                  </span>
                                </div>

                                {/* DU Warnings */}
                                {duNode.warnings.map((w, idx) => (
                                  <div key={idx} className="text-[9px] font-mono text-amber-700/80">
                                    ℹ️ {w}
                                  </div>
                                ))}

                                {/* Nozzles List */}
                                <div className="flex flex-wrap gap-1.5 pt-1">
                                  {duNode.nozzles.map(nNode => (
                                    <span key={nNode.id} className="px-2 py-0.5 bg-[#F1F5F9] text-[#B8530D] border border-[#D7E0EA] text-[10px] font-bold font-mono rounded">
                                      Nozzle #{nNode.nozzleNumber} ({nNode.status})
                                    </span>
                                  ))}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            {/* Unassigned DUs */}
            {mappingTree.unassignedDispensers.length > 0 && (
              <div className="bg-white border border-[#E2E8F0] rounded-2xl p-5 space-y-3">
                <h3 className="text-xs font-bold text-[#475569] uppercase tracking-wider font-mono flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-700" />
                  <span>Unassigned Dispensing Units (0 Configured Nozzles)</span>
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                  {mappingTree.unassignedDispensers.map(duNode => (
                    <div key={duNode.dispenser.id} className="bg-[#F8FAFC] border border-[#E2E8F0] rounded-xl p-3 text-xs space-y-1">
                      <div className="flex justify-between font-mono font-bold text-[#17365D]">
                        <span>DU #{duNode.dispenser.dispenserNumber}</span>
                        <span className="text-blue-400">{duNode.duTypeLabel}</span>
                      </div>
                      <div className="text-[10px] text-[#64748B]">{duNode.dispenser.name}</div>
                      <div className="text-[10px] font-mono text-amber-700">0 / {duNode.utilization.capacity} nozzles configured</div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      })()}

      {/* MODALS */}

      {/* Map Product Modal */}
      {modalType === 'mapProduct' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm" onClick={() => setModalType(null)} />
          <div className="relative z-10 w-full max-w-md bg-white border border-[#E2E8F0] rounded-2xl p-6 shadow-2xl">
            <h2 className="text-lg font-bold text-[#17365D] mb-2">Map Fuel Product to Outlet</h2>
            {modalError && <div className="p-3 mb-3 bg-rose-500/10 text-rose-700 text-xs rounded-xl">{modalError}</div>}
            <form onSubmit={handleMapProduct} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-[#475569] mb-1">Select Catalog Product</label>
                <select
                  value={selectedProductId}
                  onChange={(e) => setSelectedProductId(e.target.value)}
                  className="w-full bg-[#F1F5F9] border border-[#D7E0EA] rounded-xl px-3 py-2 text-xs sm:text-sm text-[#334155]"
                >
                  {catalogProducts.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.code} - {p.name} ({p.unit})
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex justify-end gap-2 pt-3">
                <button type="button" onClick={() => setModalType(null)} className="px-4 py-2 bg-[#F1F5F9] rounded-xl text-xs text-[#475569]">Cancel</button>
                <button type="submit" disabled={modalSubmitting} className="px-4 py-2 bg-orange-500 text-white rounded-xl text-xs font-bold">
                  {modalSubmitting ? 'Mapping...' : 'Confirm Mapping'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Tank Modal */}
      {modalType === 'addTank' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm" onClick={() => setModalType(null)} />
          <div className="relative z-10 w-full max-w-md bg-white border border-[#E2E8F0] rounded-2xl p-6 shadow-2xl">
            <h2 className="text-lg font-bold text-[#17365D] mb-2">Register Underground Storage Tank</h2>
            {modalError && <div className="p-3 mb-3 bg-rose-500/10 text-rose-700 text-xs rounded-xl">{modalError}</div>}
            <form onSubmit={handleAddTank} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-[#475569] mb-1">Tank Number</label>
                  <input
                    type="number"
                    value={tankNumber}
                    onChange={(e) => setTankNumber(Number(e.target.value))}
                    className="w-full bg-[#F1F5F9] border border-[#D7E0EA] rounded-xl px-3 py-2 text-xs text-[#17365D]"
                  />
                </div>
                <div>
                  <label className="block text-xs text-[#475569] mb-1">Fuel Grade</label>
                  <select
                    value={selectedProductId}
                    onChange={(e) => setSelectedProductId(e.target.value)}
                    className="w-full bg-[#F1F5F9] border border-[#D7E0EA] rounded-xl px-3 py-2 text-xs text-[#17365D]"
                  >
                    {outletProducts.map(op => (
                      <option key={op.productId} value={op.productId}>
                        {op.product?.code}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-xs text-[#475569] mb-1">Tank Name</label>
                <input
                  type="text"
                  value={tankName}
                  onChange={(e) => setTankName(e.target.value)}
                  className="w-full bg-[#F1F5F9] border border-[#D7E0EA] rounded-xl px-3 py-2 text-xs text-[#17365D]"
                />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-[10px] text-[#64748B] mb-1">Total Cap (L)</label>
                  <input
                    type="number"
                    value={tankCapacity}
                    onChange={(e) => setTankCapacity(Number(e.target.value))}
                    className="w-full bg-[#F1F5F9] border border-[#D7E0EA] rounded-xl px-2 py-1.5 text-xs text-[#17365D]"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-[#64748B] mb-1">Safe Fill (L)</label>
                  <input
                    type="number"
                    value={tankSafeFill}
                    onChange={(e) => setTankSafeFill(Number(e.target.value))}
                    className="w-full bg-[#F1F5F9] border border-[#D7E0EA] rounded-xl px-2 py-1.5 text-xs text-[#17365D]"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-[#64748B] mb-1">Min Level (L)</label>
                  <input
                    type="number"
                    value={tankMinOperating}
                    onChange={(e) => setTankMinOperating(Number(e.target.value))}
                    className="w-full bg-[#F1F5F9] border border-[#D7E0EA] rounded-xl px-2 py-1.5 text-xs text-[#17365D]"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-3">
                <button type="button" onClick={() => setModalType(null)} className="px-4 py-2 bg-[#F1F5F9] rounded-xl text-xs text-[#475569]">Cancel</button>
                <button type="submit" disabled={modalSubmitting} className="px-4 py-2 bg-orange-500 text-white rounded-xl text-xs font-bold">
                  {modalSubmitting ? 'Creating...' : 'Create Tank'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Dispenser Modal */}
      {modalType === 'addDispenser' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm" onClick={() => setModalType(null)} />
          <div className="relative z-10 w-full max-w-md bg-white border border-[#E2E8F0] rounded-2xl p-6 shadow-2xl">
            <h2 className="text-lg font-bold text-[#17365D] mb-2">Register Dispensing Unit (DU)</h2>
            {modalError && <div className="p-3 mb-3 bg-rose-500/10 text-rose-700 text-xs rounded-xl">{modalError}</div>}
            <form onSubmit={handleAddDispenser} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-[#475569] mb-1">DU # / Number</label>
                  <input
                    type="number"
                    value={dispNumber}
                    onChange={(e) => setDispNumber(Number(e.target.value))}
                    className="w-full bg-[#F1F5F9] border border-[#D7E0EA] rounded-xl px-3 py-2 text-xs text-[#17365D]"
                  />
                </div>
                <div>
                  <label className="block text-xs text-[#475569] mb-1">DU Name</label>
                  <input
                    type="text"
                    value={dispName}
                    onChange={(e) => setDispName(e.target.value)}
                    className="w-full bg-[#F1F5F9] border border-[#D7E0EA] rounded-xl px-3 py-2 text-xs text-[#17365D]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-[#475569] mb-1">Manufacturer / Make</label>
                  <input
                    type="text"
                    value={dispManufacturer}
                    onChange={(e) => setDispManufacturer(e.target.value)}
                    className="w-full bg-[#F1F5F9] border border-[#D7E0EA] rounded-xl px-3 py-2 text-xs text-[#17365D]"
                  />
                </div>
                <div>
                  <label className="block text-xs text-[#475569] mb-1">Model</label>
                  <input
                    type="text"
                    value={dispModel}
                    onChange={(e) => setDispModel(e.target.value)}
                    className="w-full bg-[#F1F5F9] border border-[#D7E0EA] rounded-xl px-3 py-2 text-xs text-[#17365D]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-[#475569] mb-1">Serial Number</label>
                  <input
                    type="text"
                    value={dispSerial}
                    onChange={(e) => setDispSerial(e.target.value)}
                    className="w-full bg-[#F1F5F9] border border-[#D7E0EA] rounded-xl px-3 py-2 text-xs text-[#17365D]"
                  />
                </div>
                <div>
                  <label className="block text-xs text-[#475569] mb-1">Commissioned Date</label>
                  <input
                    type="date"
                    value={dispCommissionedAt}
                    onChange={(e) => setDispCommissionedAt(e.target.value)}
                    className="w-full bg-[#F1F5F9] border border-[#D7E0EA] rounded-xl px-3 py-2 text-xs text-[#17365D]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs text-[#475569] mb-1">DU Operational Status</label>
                <select
                  value={dispStatus}
                  onChange={(e) => setDispStatus(e.target.value as any)}
                  className="w-full bg-[#F1F5F9] border border-[#D7E0EA] rounded-xl px-3 py-2 text-xs text-[#17365D]"
                >
                  <option value="ACTIVE">ACTIVE</option>
                  <option value="INACTIVE">INACTIVE</option>
                  <option value="MAINTENANCE">MAINTENANCE</option>
                  <option value="DECOMMISSIONED">DECOMMISSIONED</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#475569] mb-1">
                  DU Type / Nozzle Capacity
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {([2, 4, 6] as const).map((cap) => (
                    <button
                      key={cap}
                      type="button"
                      onClick={() => setDispNozzleCapacity(cap)}
                      className={`py-2 px-3 rounded-xl border text-xs font-bold transition-all ${
                        dispNozzleCapacity === cap
                          ? 'bg-orange-500/20 border-orange-500 text-[#B8530D] shadow-sm shadow-orange-500/20'
                          : 'bg-[#F1F5F9]/80 border-[#D7E0EA] text-[#64748B] hover:text-[#17365D]'
                      }`}
                    >
                      {getDuTypeLabel(cap)}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3">
                <button type="button" onClick={() => setModalType(null)} className="px-4 py-2 bg-[#F1F5F9] rounded-xl text-xs text-[#475569]">Cancel</button>
                <button type="submit" disabled={modalSubmitting} className="px-4 py-2 bg-orange-500 text-white rounded-xl text-xs font-bold">
                  {modalSubmitting ? 'Registering...' : 'Register Dispenser'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Dispenser Modal */}
      {modalType === 'editDispenser' && editingDispenser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm" onClick={() => setModalType(null)} />
          <div className="relative z-10 w-full max-w-md bg-white border border-[#E2E8F0] rounded-2xl p-6 shadow-2xl">
            <h2 className="text-lg font-bold text-[#17365D] mb-2">Configure Dispensing Unit (DU #{editingDispenser.dispenserNumber})</h2>
            {modalError && <div className="p-3 mb-3 bg-rose-500/10 text-rose-700 text-xs rounded-xl">{modalError}</div>}
            <form onSubmit={handleEditDispenser} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-[#64748B] mb-1">DU Number (Read Only)</label>
                  <div className="w-full bg-[#F1F5F9]/60 border border-[#E2E8F0] rounded-xl px-3 py-2 text-xs font-bold font-mono text-[#B8530D]">
                    DU #{editingDispenser.dispenserNumber}
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-[#475569] mb-1">DU Name</label>
                  <input
                    type="text"
                    value={dispName}
                    onChange={(e) => setDispName(e.target.value)}
                    className="w-full bg-[#F1F5F9] border border-[#D7E0EA] rounded-xl px-3 py-2 text-xs text-[#17365D]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-[#475569] mb-1">Manufacturer</label>
                  <input
                    type="text"
                    value={dispManufacturer}
                    onChange={(e) => setDispManufacturer(e.target.value)}
                    className="w-full bg-[#F1F5F9] border border-[#D7E0EA] rounded-xl px-3 py-2 text-xs text-[#17365D]"
                  />
                </div>
                <div>
                  <label className="block text-xs text-[#475569] mb-1">Model</label>
                  <input
                    type="text"
                    value={dispModel}
                    onChange={(e) => setDispModel(e.target.value)}
                    className="w-full bg-[#F1F5F9] border border-[#D7E0EA] rounded-xl px-3 py-2 text-xs text-[#17365D]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-[#475569] mb-1">Serial Number</label>
                  <input
                    type="text"
                    value={dispSerial}
                    onChange={(e) => setDispSerial(e.target.value)}
                    className="w-full bg-[#F1F5F9] border border-[#D7E0EA] rounded-xl px-3 py-2 text-xs text-[#17365D]"
                  />
                </div>
                <div>
                  <label className="block text-xs text-[#475569] mb-1">Commissioned Date</label>
                  <input
                    type="date"
                    value={dispCommissionedAt}
                    onChange={(e) => setDispCommissionedAt(e.target.value)}
                    className="w-full bg-[#F1F5F9] border border-[#D7E0EA] rounded-xl px-3 py-2 text-xs text-[#17365D]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs text-[#475569] mb-1">DU Operational Status</label>
                <select
                  value={dispStatus}
                  onChange={(e) => setDispStatus(e.target.value as any)}
                  className="w-full bg-[#F1F5F9] border border-[#D7E0EA] rounded-xl px-3 py-2 text-xs text-[#17365D]"
                >
                  <option value="ACTIVE">ACTIVE</option>
                  <option value="INACTIVE">INACTIVE</option>
                  <option value="MAINTENANCE">MAINTENANCE</option>
                  <option value="DECOMMISSIONED">DECOMMISSIONED</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[#475569] mb-1">
                  DU Type / Nozzle Capacity
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {([2, 4, 6] as const).map((cap) => (
                    <button
                      key={cap}
                      type="button"
                      onClick={() => setDispNozzleCapacity(cap)}
                      className={`py-2 px-3 rounded-xl border text-xs font-bold transition-all ${
                        dispNozzleCapacity === cap
                          ? 'bg-orange-500/20 border-orange-500 text-[#B8530D] shadow-sm shadow-orange-500/20'
                          : 'bg-[#F1F5F9]/80 border-[#D7E0EA] text-[#64748B] hover:text-[#17365D]'
                      }`}
                    >
                      {getDuTypeLabel(cap)}
                    </button>
                  ))}
                </div>
                <p className="text-[10px] text-[#64748B] mt-1">
                  Cannot be reduced below existing configured nozzle positions on this unit.
                </p>
              </div>

              <div className="flex justify-end gap-2 pt-3">
                <button type="button" onClick={() => setModalType(null)} className="px-4 py-2 bg-[#F1F5F9] rounded-xl text-xs text-[#475569]">Cancel</button>
                <button type="submit" disabled={modalSubmitting} className="px-4 py-2 bg-orange-500 text-white rounded-xl text-xs font-bold">
                  {modalSubmitting ? 'Saving...' : 'Update Dispenser'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Nozzle Modal (Product-First Flow with Position Selection) */}
      {modalType === 'addNozzle' && (() => {
        const resolved = resolveNozzleFormState(dispensers, nozzles, outletProducts, tanks, {
          dispenserId: nozzleDispenserId,
          nozzleNumber: Number(nozzleNumber),
          productId: nozzleProductId,
          tankId: nozzleTankId,
        });
        const selectedDu = resolved.selectedDispenser;
        const availablePositions = resolved.availablePositions;
        const activeLiquidOps = resolved.activeLiquidProducts;
        const matchingTanks = resolved.matchingTanks;
        const isNoPositionsAvailable = availablePositions.length === 0;

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm" onClick={() => setModalType(null)} />
            <div className="relative z-10 w-full max-w-md bg-white border border-[#E2E8F0] rounded-2xl p-6 shadow-2xl space-y-4">
              <h2 className="text-lg font-bold text-[#17365D]">Configure Fuel Nozzle</h2>
              {modalError && <div className="p-3 bg-rose-500/10 text-rose-700 text-xs rounded-xl">{modalError}</div>}

              <form onSubmit={handleAddNozzle} className="space-y-3">
                {/* 1. Select DU */}
                <div>
                  <label className="block text-xs font-semibold text-[#475569] mb-1">
                    1. Select Dispensing Unit (DU)
                  </label>
                  <select
                    value={resolved.dispenserId}
                    onChange={(e) => handleNozzleDispenserChange(e.target.value)}
                    className="w-full bg-[#F1F5F9] border border-[#D7E0EA] rounded-xl px-3 py-2 text-xs text-[#17365D] font-medium"
                  >
                    {dispensers.map(d => (
                      <option key={d.id} value={d.id}>
                        DU #{d.dispenserNumber} — {d.name} ({getDuTypeLabel(d.nozzleCapacity)})
                      </option>
                    ))}
                  </select>
                </div>

                {/* 2. Select Nozzle Position */}
                <div>
                  <label className="block text-xs font-semibold text-[#475569] mb-1">
                    2. Select Available Nozzle Position
                  </label>
                  {isNoPositionsAvailable ? (
                    <div className="p-3 bg-amber-500/10 border border-amber-500/20 text-amber-700 text-xs rounded-xl font-medium">
                      All nozzle positions on this DU ({selectedDu?.nozzleCapacity || 6}) are already configured.
                    </div>
                  ) : (
                    <select
                      value={resolved.nozzleNumber}
                      onChange={(e) => {
                        setNozzleNumber(Number(e.target.value));
                        setModalError(null);
                      }}
                      className="w-full bg-[#F1F5F9] border border-[#D7E0EA] rounded-xl px-3 py-2 text-xs text-[#17365D] font-bold font-mono"
                    >
                      {availablePositions.map(pos => (
                        <option key={pos} value={pos}>
                          Position #{pos}
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                {/* 3. Select Fuel Product */}
                <div>
                  <label className="block text-xs font-semibold text-[#475569] mb-1">
                    3. Select Fuel Product (Active Liquid Grades)
                  </label>
                  <select
                    value={resolved.productId}
                    onChange={(e) => handleNozzleProductChange(e.target.value)}
                    className="w-full bg-[#F1F5F9] border border-[#D7E0EA] rounded-xl px-3 py-2 text-xs text-[#17365D] font-medium"
                  >
                    {activeLiquidOps.map(op => {
                      const prod = op.product || catalogProducts.find(p => p.id === op.productId);
                      return (
                        <option key={op.productId} value={op.productId}>
                          {prod ? `${prod.code} — ${prod.name}` : op.productId}
                        </option>
                      );
                    })}
                  </select>
                </div>

                {/* 4. Select Underground Tank */}
                <div>
                  <label className="block text-xs font-semibold text-[#475569] mb-1">
                    4. Select Connected Underground Tank
                  </label>
                  {matchingTanks.length === 0 ? (
                    <div className="p-3 bg-rose-500/10 border border-rose-500/20 text-rose-700 text-xs rounded-xl font-medium">
                      No active underground tanks configured for this product grade. Please create an underground tank first.
                    </div>
                  ) : (
                    <select
                      value={resolved.tankId}
                      onChange={(e) => {
                        setNozzleTankId(e.target.value);
                        setModalError(null);
                      }}
                      className="w-full bg-[#F1F5F9] border border-[#D7E0EA] rounded-xl px-3 py-2 text-xs text-[#17365D] font-medium"
                    >
                      {matchingTanks.map(t => (
                        <option key={t.id} value={t.id}>
                          Tank #{t.tankNumber} — {t.name} ({t.capacityLitres.toLocaleString()} L)
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                <div className="flex justify-end gap-2 pt-3">
                  <button type="button" onClick={() => setModalType(null)} className="px-4 py-2 bg-[#F1F5F9] rounded-xl text-xs text-[#475569]">Cancel</button>
                  <button
                    type="submit"
                    disabled={modalSubmitting || isNoPositionsAvailable || matchingTanks.length === 0}
                    className="px-4 py-2 bg-orange-500 disabled:opacity-50 disabled:cursor-not-allowed text-[#17365D] rounded-xl text-xs font-bold shadow-md shadow-orange-500/20"
                  >
                    {modalSubmitting ? 'Saving...' : 'Configure Nozzle'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        );
      })()}

      {/* Add Shift Template Modal */}
      {modalType === 'addShift' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm" onClick={() => setModalType(null)} />
          <div className="relative z-10 w-full max-w-md bg-white border border-[#E2E8F0] rounded-2xl p-6 shadow-2xl">
            <h2 className="text-lg font-bold text-[#17365D] mb-2">Create Shift Template</h2>
            {modalError && <div className="p-3 mb-3 bg-rose-500/10 text-rose-700 text-xs rounded-xl">{modalError}</div>}
            <form onSubmit={handleAddShift} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-[#475569] mb-1">Shift Code</label>
                  <input
                    type="text"
                    value={shiftCode}
                    onChange={(e) => setShiftCode(e.target.value.toUpperCase())}
                    placeholder="e.g. SHIFT_1"
                    className="w-full bg-[#F1F5F9] border border-[#D7E0EA] rounded-xl px-3 py-2 text-xs text-[#17365D] font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs text-[#475569] mb-1">Sequence</label>
                  <input
                    type="number"
                    value={shiftSeq}
                    onChange={(e) => setShiftSeq(Number(e.target.value))}
                    className="w-full bg-[#F1F5F9] border border-[#D7E0EA] rounded-xl px-3 py-2 text-xs text-[#17365D] font-mono"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs text-[#475569] mb-1">Name</label>
                <input
                  type="text"
                  value={shiftName}
                  onChange={(e) => setShiftName(e.target.value)}
                  placeholder="e.g. Morning Shift"
                  className="w-full bg-[#F1F5F9] border border-[#D7E0EA] rounded-xl px-3 py-2 text-xs text-[#17365D]"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-[#475569] mb-1">Start Time (24h)</label>
                  <input
                    type="text"
                    value={shiftStart}
                    onChange={(e) => setShiftStart(e.target.value)}
                    placeholder="06:00"
                    className="w-full bg-[#F1F5F9] border border-[#D7E0EA] rounded-xl px-3 py-2 text-xs text-[#17365D] font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs text-[#475569] mb-1">End Time (24h)</label>
                  <input
                    type="text"
                    value={shiftEnd}
                    onChange={(e) => setShiftEnd(e.target.value)}
                    placeholder="14:00"
                    className="w-full bg-[#F1F5F9] border border-[#D7E0EA] rounded-xl px-3 py-2 text-xs text-[#17365D] font-mono"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-3">
                <button type="button" onClick={() => setModalType(null)} className="px-4 py-2 bg-[#F1F5F9] rounded-xl text-xs text-[#475569]">Cancel</button>
                <button type="submit" disabled={modalSubmitting} className="px-4 py-2 bg-orange-500 text-white rounded-xl text-xs font-bold">
                  {modalSubmitting ? 'Saving...' : 'Save Template'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Global Shift Template Modal */}
      {modalType === 'editShift' && editingShift && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm" onClick={() => setModalType(null)} />
          <div className="relative z-10 w-full max-w-md bg-white border border-[#E2E8F0] rounded-2xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-[#17365D]">Edit Shift Template ({editingShift.code})</h2>
                <p className="text-xs text-[#64748B] mt-0.5">
                  Update central shift timing, sequence, and operational status
                </p>
              </div>
              <button
                type="button"
                onClick={() => setModalType(null)}
                className="p-1 rounded-lg text-[#64748B] hover:text-[#17365D] hover:bg-[#F1F5F9]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {modalError && (
              <div className="p-3 bg-rose-500/10 border border-rose-500/30 text-rose-700 text-xs rounded-xl flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{modalError}</span>
              </div>
            )}

            <form onSubmit={handleEditShift} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-[#64748B] mb-1">Shift Code (Immutable)</label>
                  <div className="w-full bg-[#F1F5F9]/60 border border-[#E2E8F0] rounded-xl px-3 py-2 text-xs font-bold font-mono text-[#B8530D]">
                    {editingShift.code}
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-[#475569] mb-1">Sequence</label>
                  <input
                    type="number"
                    value={editShiftSeq}
                    onChange={(e) => setEditShiftSeq(Number(e.target.value))}
                    className="w-full bg-[#F1F5F9] border border-[#D7E0EA] rounded-xl px-3 py-2 text-xs text-[#17365D] font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs text-[#475569] mb-1">Shift Name</label>
                <input
                  type="text"
                  value={editShiftName}
                  onChange={(e) => setEditShiftName(e.target.value)}
                  className="w-full bg-[#F1F5F9] border border-[#D7E0EA] rounded-xl px-3 py-2 text-xs text-[#17365D]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-[#475569] mb-1">Start Time (24h)</label>
                  <input
                    type="text"
                    value={editShiftStart}
                    onChange={(e) => setEditShiftStart(e.target.value)}
                    className="w-full bg-[#F1F5F9] border border-[#D7E0EA] rounded-xl px-3 py-2 text-xs text-[#17365D] font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs text-[#475569] mb-1">End Time (24h)</label>
                  <input
                    type="text"
                    value={editShiftEnd}
                    onChange={(e) => setEditShiftEnd(e.target.value)}
                    className="w-full bg-[#F1F5F9] border border-[#D7E0EA] rounded-xl px-3 py-2 text-xs text-[#17365D] font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs text-[#475569] mb-1">Operational Status</label>
                <select
                  value={editShiftStatus}
                  onChange={(e) => setEditShiftStatus(e.target.value as any)}
                  className="w-full bg-[#F1F5F9] border border-[#D7E0EA] rounded-xl px-3 py-2 text-xs text-[#17365D]"
                >
                  <option value="ACTIVE">ACTIVE</option>
                  <option value="INACTIVE">INACTIVE</option>
                </select>
              </div>

              <div className="p-2.5 bg-[#F8FAFC]/60 border border-[#E2E8F0] rounded-xl text-[11px] text-[#64748B]">
                ℹ️ Notice: Inactivating a shift template prevents it from being used for new operational shifts or roster schedules, while all historical shifts remain completely intact.
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setModalType(null)}
                  className="px-4 py-2 bg-[#F1F5F9] rounded-xl text-xs text-[#475569]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={modalSubmitting}
                  className="px-4 py-2 bg-orange-500 text-white rounded-xl text-xs font-bold"
                >
                  {modalSubmitting ? 'Saving...' : 'Update Shift'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Tank Modal */}
      {modalType === 'editTank' && editingTank && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm" onClick={() => setModalType(null)} />
          <div className="relative z-10 w-full max-w-md bg-white border border-[#E2E8F0] rounded-2xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-[#17365D]">Edit Tank #{editingTank.tankNumber}</h2>
                <p className="text-xs text-[#64748B] mt-0.5">
                  Update tank specifications and operational lifecycle status
                </p>
              </div>
              <button
                type="button"
                onClick={() => setModalType(null)}
                className="p-1 rounded-lg text-[#64748B] hover:text-[#17365D] hover:bg-[#F1F5F9]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {modalError && (
              <div className="p-3 bg-rose-500/10 border border-rose-500/30 text-rose-700 text-xs rounded-xl flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{modalError}</span>
              </div>
            )}

            <form onSubmit={handleEditTank} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-[#64748B] mb-1">Tank Number (Read Only)</label>
                  <div className="w-full bg-[#F1F5F9]/60 border border-[#E2E8F0] rounded-xl px-3 py-2 text-xs font-bold font-mono text-[#B8530D]">
                    Tank #{editingTank.tankNumber}
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-[#475569] mb-1">Fuel Grade</label>
                  <select
                    value={editTankProductId}
                    onChange={(e) => setEditTankProductId(e.target.value)}
                    className="w-full bg-[#F1F5F9] border border-[#D7E0EA] rounded-xl px-3 py-2 text-xs text-[#17365D]"
                  >
                    {outletProducts.map(op => (
                      <option key={op.productId} value={op.productId}>
                        {op.product?.code || op.productId}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs text-[#475569] mb-1">Tank Name</label>
                <input
                  type="text"
                  value={editTankName}
                  onChange={(e) => setEditTankName(e.target.value)}
                  className="w-full bg-[#F1F5F9] border border-[#D7E0EA] rounded-xl px-3 py-2 text-xs text-[#17365D]"
                />
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-[10px] text-[#64748B] mb-1">Total Cap (L)</label>
                  <input
                    type="number"
                    value={editTankCapacity}
                    onChange={(e) => setEditTankCapacity(Number(e.target.value))}
                    className="w-full bg-[#F1F5F9] border border-[#D7E0EA] rounded-xl px-2 py-1.5 text-xs text-[#17365D]"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-[#64748B] mb-1">Safe Fill (L)</label>
                  <input
                    type="number"
                    value={editTankSafeFill}
                    onChange={(e) => setEditTankSafeFill(Number(e.target.value))}
                    className="w-full bg-[#F1F5F9] border border-[#D7E0EA] rounded-xl px-2 py-1.5 text-xs text-[#17365D]"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-[#64748B] mb-1">Min Level (L)</label>
                  <input
                    type="number"
                    value={editTankMinOperating}
                    onChange={(e) => setEditTankMinOperating(Number(e.target.value))}
                    className="w-full bg-[#F1F5F9] border border-[#D7E0EA] rounded-xl px-2 py-1.5 text-xs text-[#17365D]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs text-[#475569] mb-1">Tank Operational Status</label>
                <select
                  value={editTankStatus}
                  onChange={(e) => setEditTankStatus(e.target.value as any)}
                  className="w-full bg-[#F1F5F9] border border-[#D7E0EA] rounded-xl px-3 py-2 text-xs text-[#17365D]"
                >
                  <option value="ACTIVE">ACTIVE</option>
                  <option value="INACTIVE">INACTIVE</option>
                  <option value="MAINTENANCE">MAINTENANCE</option>
                  <option value="DECOMMISSIONED">DECOMMISSIONED</option>
                </select>
              </div>

              <div className="p-2.5 bg-[#F8FAFC]/60 border border-[#E2E8F0] rounded-xl text-[11px] text-[#64748B]">
                ℹ️ Notice: Changing fuel grade product on an operational tank will be safely rejected if connected nozzles, historical meter readings, or fuel receipts are recorded.
              </div>

              <div className="flex justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setModalType(null)}
                  className="px-4 py-2 bg-[#F1F5F9] rounded-xl text-xs text-[#475569]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={modalSubmitting}
                  className="px-4 py-2 bg-orange-500 text-white rounded-xl text-xs font-bold"
                >
                  {modalSubmitting ? 'Saving...' : 'Update Tank'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Edit Nozzle Mapping Modal */}
      {modalType === 'editNozzle' && editingNozzle && (() => {
        const activeLiquidOps = getActiveLiquidOutletProducts(outletProducts);
        const matchingTanks = filterTanksForEditNozzle(tanks, editNozzleProductId);
        const isMismatched = !matchingTanks.some(t => t.id === editNozzleTankId);

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm" onClick={() => setModalType(null)} />
            <div className="relative z-10 w-full max-w-md bg-white border border-[#E2E8F0] rounded-2xl p-6 shadow-2xl space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-bold text-[#17365D]">Edit Nozzle Mapping</h2>
                  <p className="text-xs text-[#64748B] mt-0.5">
                    Correct retail outlet infrastructure configuration for future operational shifts
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setModalType(null)}
                  className="p-1 rounded-lg text-[#64748B] hover:text-[#17365D] hover:bg-[#F1F5F9]"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {modalError && (
                <div className="p-3 bg-rose-500/10 border border-rose-500/30 text-rose-700 text-xs rounded-xl flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{modalError}</span>
                </div>
              )}

              <form onSubmit={handleEditNozzle} className="space-y-4">
                {/* 1. Dispensing Unit (Immutable) */}
                <div>
                  <label className="block text-xs font-semibold text-[#64748B] mb-1">
                    Dispensing Unit (DU / MPD)
                  </label>
                  <div className="w-full bg-[#F1F5F9]/60 border border-[#E2E8F0] rounded-xl px-3 py-2 text-xs font-mono font-bold text-[#334155]">
                    MPD #{editingNozzle.dispenserNumber} ({editingNozzle.dispenserName || `DU #${editingNozzle.dispenserNumber}`})
                  </div>
                  <span className="text-[10px] text-[#64748B] mt-1 block">Dispenser unit assignment is immutable in this phase</span>
                </div>

                {/* 2. Nozzle Position (Immutable) */}
                <div>
                  <label className="block text-xs font-semibold text-[#64748B] mb-1">
                    Nozzle Number / Position
                  </label>
                  <div className="w-full bg-[#F1F5F9]/60 border border-[#E2E8F0] rounded-xl px-3 py-2 text-xs font-mono font-bold text-[#B8530D]">
                    Position #{editingNozzle.nozzleNumber}
                  </div>
                </div>

                {/* 3. Fuel Product Dropdown */}
                <div>
                  <label className="block text-xs font-semibold text-[#475569] mb-1">
                    Fuel Product (Active Liquid Grades)
                  </label>
                  <select
                    value={editNozzleProductId}
                    onChange={(e) => handleEditNozzleProductChange(e.target.value)}
                    className="w-full bg-[#F1F5F9] border border-[#D7E0EA] rounded-xl px-3 py-2 text-xs text-[#17365D] font-medium focus:outline-none focus:border-orange-500"
                  >
                    {activeLiquidOps.map(op => {
                      const prod = op.product || catalogProducts.find(p => p.id === op.productId);
                      return (
                        <option key={op.productId} value={op.productId}>
                          {prod ? `${prod.code} — ${prod.name}` : op.productId}
                        </option>
                      );
                    })}
                  </select>
                </div>

                {/* 4. Connected Tank Dropdown */}
                <div>
                  <label className="block text-xs font-semibold text-[#475569] mb-1">
                    Connected Underground Tank (Active)
                  </label>
                  {matchingTanks.length === 0 ? (
                    <div className="p-3 bg-rose-500/10 border border-rose-500/20 text-rose-700 text-xs rounded-xl font-medium">
                      No active tanks found for this fuel product grade.
                    </div>
                  ) : (
                    <select
                      value={editNozzleTankId}
                      onChange={(e) => handleEditNozzleTankChange(e.target.value)}
                      className="w-full bg-[#F1F5F9] border border-[#D7E0EA] rounded-xl px-3 py-2 text-xs text-[#17365D] font-medium focus:outline-none focus:border-orange-500"
                    >
                      {matchingTanks.map(t => (
                        <option key={t.id} value={t.id}>
                          Tank #{t.tankNumber} — {t.name} ({t.capacityLitres.toLocaleString()} L)
                        </option>
                      ))}
                    </select>
                  )}
                  {isMismatched && (
                    <span className="text-[10px] text-amber-700 mt-1 block">
                      ⚠️ Please select a valid tank matching the selected fuel product.
                    </span>
                  )}
                </div>

                {/* 5. Operational Status */}
                <div>
                  <label className="block text-xs font-semibold text-[#475569] mb-1">
                    Lifecycle Status
                  </label>
                  <select
                    value={editNozzleStatus}
                    onChange={(e) => setEditNozzleStatus(e.target.value as any)}
                    className="w-full bg-[#F1F5F9] border border-[#D7E0EA] rounded-xl px-3 py-2 text-xs text-[#17365D] font-medium focus:outline-none focus:border-orange-500"
                  >
                    <option value="ACTIVE">ACTIVE</option>
                    <option value="INACTIVE">INACTIVE</option>
                    <option value="MAINTENANCE">MAINTENANCE</option>
                    <option value="DECOMMISSIONED">DECOMMISSIONED</option>
                  </select>
                </div>

                {/* Notice regarding historical safety */}
                <div className="p-2.5 bg-[#F8FAFC]/60 border border-[#E2E8F0] rounded-xl text-[11px] text-[#64748B]">
                  ℹ️ Changes to this nozzle mapping take effect immediately for future shifts. Historical shift snapshots and closed meter readings remain safely unchanged.
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setModalType(null)}
                    className="px-4 py-2 bg-[#F1F5F9] hover:bg-[#E8EEF5] rounded-xl text-xs text-[#475569] font-semibold transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={modalSubmitting || matchingTanks.length === 0 || isMismatched}
                    className="px-4 py-2 bg-gradient-to-r from-orange-500 to-amber-600 disabled:opacity-50 disabled:cursor-not-allowed text-[#17365D] rounded-xl text-xs font-bold shadow-md shadow-orange-500/20 transition-all"
                  >
                    {modalSubmitting ? 'Saving...' : 'Save Mapping'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        );
      })()}

      {/* Tank Calibration Chart Modal */}
      {modalType === 'tankCalibration' && calibratingTank && (() => {
        const activePoints = tankCalibrationByTankId[calibratingTank.id] || [];
        const calPoints = calModalPoints.length > 0 || calSelectedChart ? calModalPoints : activePoints;
        const calStatus = getTankCalibrationStatus(activePoints.length);
        const isLoadingPoints = loadingCalibrationTankId === calibratingTank.id;
        const isChartLocked = Boolean(calSelectedChart?.isReferenced);
        const maxDipNum = calMaxDipMmInput.trim() ? Number(calMaxDipMmInput) : undefined;
        const diaNum = calDiameterMmInput.trim() ? Number(calDiameterMmInput) : undefined;

        const currentChartDiagnostics = analyzeCalibrationChartDiagnostics(calPoints, {
          tankCapacityLitres: calibratingTank.capacityLitres,
          safeFillCapacityLitres: calibratingTank.safeFillCapacityLitres,
        });

        const csvPreview = calBulkText.trim()
          ? buildCalibrationImportPreview(calBulkText, {
              tankCapacityLitres: calibratingTank.capacityLitres,
              safeFillCapacityLitres: calibratingTank.safeFillCapacityLitres,
              allowOverCapacity: calAllowOverCapacity,
              maxDipMm: Number.isFinite(maxDipNum) ? maxDipNum : undefined,
              tankDiameterMm: Number.isFinite(diaNum) ? diaNum : undefined,
            })
          : null;

        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <div
              className="fixed inset-0 bg-slate-950/60 backdrop-blur-sm"
              onClick={() => setModalType(null)}
            />
            <div className="relative z-10 w-full max-w-4xl max-h-[92vh] overflow-y-auto bg-white border border-[#E2E8F0] rounded-2xl p-6 shadow-2xl space-y-5">
              {/* Header */}
              <div className="flex items-start justify-between gap-4 border-b border-[#E2E8F0] pb-4">
                <div className="flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-lg font-bold text-[#17365D]">
                      Tank Calibration Chart
                    </h2>
                    <span
                      className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold border inline-flex items-center gap-1.5 font-mono ${calStatus.badgeClass}`}
                    >
                      {calStatus.isConfigured ? (
                        <CheckCircle className="w-3 h-3 shrink-0" />
                      ) : (
                        <AlertTriangle className="w-3 h-3 shrink-0" />
                      )}
                      <span>Calibration: {calStatus.badgeLabel}</span>
                    </span>
                    {calSelectedChart && (
                      <span
                        className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold border inline-flex items-center gap-1 font-mono ${
                          calSelectedChart.status === 'ACTIVE'
                            ? 'bg-emerald-500/10 text-emerald-800 border-emerald-500/30'
                            : calSelectedChart.status === 'APPROVED'
                              ? 'bg-cyan-500/10 text-cyan-300 border-cyan-500/30'
                              : calSelectedChart.status === 'DRAFT'
                                ? 'bg-amber-500/10 text-amber-800 border-amber-500/30'
                                : 'bg-[#F1F5F9] text-[#64748B] border-[#D7E0EA]'
                        }`}
                      >
                        Rev #{calSelectedChart.revisionNumber} • {calSelectedChart.status}
                      </span>
                    )}
                    {calSelectedChart && (
                      <span
                        className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold border inline-flex items-center gap-1 font-mono ${
                          isChartLocked
                            ? 'bg-rose-500/10 text-rose-800 border-rose-500/30'
                            : 'bg-[#F1F5F9] text-[#475569] border-[#D7E0EA]'
                        }`}
                      >
                        {isChartLocked ? (
                          <>
                            <Lock className="w-3 h-3 shrink-0 text-rose-700" />
                            <span>Locked (Historical Readings)</span>
                          </>
                        ) : (
                          <span>Editable Revision</span>
                        )}
                      </span>
                    )}
                  </div>
                  <div className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-4 text-xs font-mono">
                    <div>
                      <span className="text-[#64748B] block text-[10px]">TANK</span>
                      <span className="text-[#B8530D] font-bold">
                        Tank #{calibratingTank.tankNumber} — {calibratingTank.productCode || calibratingTank.productName}
                      </span>
                    </div>
                    <div>
                      <span className="text-[#64748B] block text-[10px]">NOMINAL CAPACITY</span>
                      <span className="text-[#17365D] font-bold">
                        {calibratingTank.capacityLitres.toLocaleString()} L
                      </span>
                    </div>
                    <div>
                      <span className="text-[#64748B] block text-[10px]">SAFE FILL LIMIT</span>
                      <span className="text-[#475569]">
                        {calibratingTank.safeFillCapacityLitres.toLocaleString()} L
                      </span>
                    </div>
                    <div>
                      <span className="text-[#64748B] block text-[10px]">UNITS</span>
                      <span className="text-[#475569]">
                        Dip: mm • Vol: Litres (L)
                      </span>
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setModalType(null)}
                  className="p-1.5 rounded-lg text-[#64748B] hover:text-[#17365D] hover:bg-[#F1F5F9]"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Revision Selector & Lifecycle Controls */}
              {calCharts.length > 0 && (
                <div className="p-3.5 bg-slate-950/60 border border-[#E2E8F0] rounded-xl space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <label className="text-[11px] font-mono text-[#64748B] uppercase font-bold">
                        Chart Revision:
                      </label>
                      <select
                        value={calSelectedChart?.id || ''}
                        onChange={e => handleSelectCalibrationChartRevision(e.target.value)}
                        className="bg-white border border-[#D7E0EA] rounded-lg px-2.5 py-1.5 text-xs text-[#17365D] font-mono focus:outline-none focus:border-orange-500"
                      >
                        {calCharts.map(ch => (
                          <option key={ch.id} value={ch.id}>
                            Rev #{ch.revisionNumber} — {ch.status} ({ch.pointsCount ?? 0} pts)
                            {ch.isReferenced ? ' [Referenced]' : ''}
                            {ch.sourceFileName ? ` • ${ch.sourceFileName}` : ''}
                          </option>
                        ))}
                      </select>
                    </div>

                    {canWriteTankCalibration && calSelectedChart && (
                      <div className="flex flex-wrap items-center gap-2">
                        {canApproveCalibrationChart && calSelectedChart.status === 'DRAFT' && (
                          <button
                            type="button"
                            disabled={modalSubmitting || calPoints.length < 2}
                            onClick={() => handleUpdateCalibrationChartStatus(calSelectedChart.id, 'APPROVED')}
                            className="px-2.5 py-1 rounded-lg bg-cyan-500/15 hover:bg-cyan-500/25 disabled:opacity-50 text-cyan-300 border border-cyan-500/30 text-[11px] font-mono font-semibold"
                          >
                            Approve Revision
                          </button>
                        )}
                        {canApproveCalibrationChart &&
                          (calSelectedChart.status === 'DRAFT' ||
                            calSelectedChart.status === 'APPROVED') && (
                          <button
                            type="button"
                            disabled={modalSubmitting || calPoints.length < 2}
                            onClick={() => handleUpdateCalibrationChartStatus(calSelectedChart.id, 'ACTIVE')}
                            className="px-2.5 py-1 rounded-lg bg-emerald-500/20 hover:bg-emerald-500/30 disabled:opacity-50 text-emerald-800 border border-emerald-500/30 text-[11px] font-mono font-bold"
                          >
                            Activate Revision #{calSelectedChart.revisionNumber}
                          </button>
                        )}
                        <button
                          type="button"
                          disabled={modalSubmitting}
                          onClick={handleForkCalibrationRevision}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#F1F5F9] hover:bg-[#E8EEF5] disabled:opacity-50 text-[#334155] border border-[#D7E0EA] text-[11px] font-mono font-semibold"
                        >
                          <GitBranch className="w-3 h-3 text-[#B8530D]" />
                          <span>Fork New Draft Revision</span>
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Selected Revision Metadata */}
                  {calSelectedChart && (
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 pt-2 border-t border-[#E2E8F0]/80 text-[11px] font-mono">
                      <div>
                        <span className="text-[#64748B] block text-[10px]">DIMENSIONS (D × L)</span>
                        <span className="text-[#334155]">
                          {calSelectedChart.tankDiameterMmStr
                            ? `${formatCalibrationDisplay(calSelectedChart.tankDiameterMmStr)} mm`
                            : '—'}{' '}
                          ×{' '}
                          {calSelectedChart.tankLengthMmStr
                            ? `${formatCalibrationDisplay(calSelectedChart.tankLengthMmStr)} mm`
                            : '—'}
                        </span>
                      </div>
                      <div>
                        <span className="text-[#64748B] block text-[10px]">MAX DIP / VOL</span>
                        <span className="text-[#334155]">
                          {calSelectedChart.maxDipMmStr
                            ? `${formatCalibrationDisplay(calSelectedChart.maxDipMmStr)} mm`
                            : `${formatCalibrationDisplay(currentChartDiagnostics.maxDipMm)} mm`}{' '}
                          /{' '}
                          {calSelectedChart.chartCapacityLitreStr
                            ? `${formatCalibrationDisplay(calSelectedChart.chartCapacityLitreStr)} L`
                            : `${formatCalibrationDisplay(currentChartDiagnostics.maxVolumeLitres)} L`}
                        </span>
                      </div>
                      <div>
                        <span className="text-[#64748B] block text-[10px]">CURVE / STEP</span>
                        <span className="text-[#334155]">
                          {currentChartDiagnostics.isNonLinear ? 'Non-Linear' : 'Linear'}
                          {currentChartDiagnostics.dominantStepMm
                            ? ` (${formatCalibrationDisplay(currentChartDiagnostics.dominantStepMm)} mm)`
                            : ''}
                        </span>
                      </div>
                      <div>
                        <span className="text-[#64748B] block text-[10px]">SOURCE / CERT</span>
                        <span className="text-[#334155] truncate block" title={calSelectedChart.sourceFileName || calSelectedChart.referenceDocument || ''}>
                          {calSelectedChart.sourceFileName || calSelectedChart.referenceDocument || 'Manual / Seed'}
                        </span>
                      </div>
                      <div>
                        <span className="text-[#64748B] block text-[10px]">EFFECTIVE FROM</span>
                        <span className="text-[#334155]">
                          {calSelectedChart.effectiveFrom
                            ? calSelectedChart.effectiveFrom.slice(0, 10)
                            : 'Immediate'}
                        </span>
                      </div>
                    </div>
                  )}

                  {isChartLocked && (
                    <div className="p-2.5 bg-amber-500/10 border border-amber-500/25 rounded-lg text-[11px] text-amber-200 font-mono flex items-center justify-between gap-2">
                      <span>
                        🔒 Revision #{calSelectedChart?.revisionNumber} is referenced by historical tank stock readings and is immutable. To modify calibration points, fork a new draft revision or use Bulk Import (which automatically creates a new revision).
                      </span>
                    </div>
                  )}
                </div>
              )}

              {!calStatus.isConfigured && (
                <div className="p-3 bg-amber-500/10 border border-amber-500/30 text-amber-800 text-xs rounded-xl font-mono flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0" />
                  <span>
                    {calStatus.warningText ||
                      'At least 2 calibration points are required before Daily Operations allows tank dip entry.'}
                  </span>
                </div>
              )}

              {currentChartDiagnostics.missingStepWarnings.length > 0 && (
                <div className="p-3 bg-amber-500/10 border border-amber-500/30 text-amber-800 text-xs rounded-xl font-mono space-y-1">
                  <div className="font-bold flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-700 shrink-0" />
                    <span>
                      Step Interval Diagnostics ({currentChartDiagnostics.missingStepWarnings.length} gap notice{currentChartDiagnostics.missingStepWarnings.length > 1 ? 's' : ''})
                    </span>
                  </div>
                  <ul className="list-disc list-inside text-[11px] text-amber-200/90 space-y-0.5">
                    {currentChartDiagnostics.missingStepWarnings.slice(0, 3).map((w, idx) => (
                      <li key={idx}>{w.message}</li>
                    ))}
                  </ul>
                </div>
              )}

              {modalError && (
                <div className="p-3 bg-rose-500/10 border border-rose-500/30 text-rose-700 text-xs rounded-xl flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{modalError}</span>
                </div>
              )}

              {/* Calibration Points Table & Action Toolbar */}
              <div className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-[#475569] font-mono">
                    Calibration Points ({calPoints.length})
                    {calSelectedChart ? ` — Rev #${calSelectedChart.revisionNumber}` : ''}
                  </h3>
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setCalShowDryRun(prev => !prev);
                        setModalError(null);
                      }}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#F1F5F9] hover:bg-[#E8EEF5] text-cyan-400 border border-[#D7E0EA] text-[11px] font-mono font-semibold transition-colors"
                    >
                      <FlaskConical className="w-3 h-3" />
                      <span>{calShowDryRun ? 'Hide Dry-Run Verifier' : 'Dry-Run vs Printed Chart'}</span>
                    </button>
                    {canWriteTankCalibration && (
                      <>
                        <button
                          type="button"
                          onClick={handleLoadDummyCalibrationPreset}
                          className="px-2.5 py-1 rounded-lg bg-[#F1F5F9] hover:bg-[#E8EEF5] text-amber-700 border border-[#D7E0EA] text-[11px] font-mono font-semibold transition-colors"
                        >
                          Load 5-Point UAT Preset (0–2000 mm)
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setCalShowBulkImport(prev => !prev);
                            setModalError(null);
                          }}
                          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-[#F1F5F9] hover:bg-[#E8EEF5] text-[#B8530D] border border-[#D7E0EA] text-[11px] font-mono font-semibold transition-colors"
                        >
                          <Upload className="w-3 h-3" />
                          <span>{calShowBulkImport ? 'Hide CSV / Bulk Import' : 'CSV / Bulk Import Chart'}</span>
                        </button>
                      </>
                    )}
                  </div>
                </div>

                <div className="overflow-x-auto bg-slate-950/60 border border-[#E2E8F0] rounded-xl max-h-60">
                  <table className="w-full text-left text-xs font-mono">
                    <thead className="bg-[#F1F5F9]/80 text-[#64748B] uppercase text-[10px] border-b border-[#E2E8F0] sticky top-0">
                      <tr>
                        <th className="py-2.5 px-4">Dip (mm)</th>
                        <th className="py-2.5 px-4">Volume (L)</th>
                        {canWriteTankCalibration && !isChartLocked && (
                          <th className="py-2.5 px-4 text-right">Actions</th>
                        )}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/60">
                      {isLoadingPoints ? (
                        <tr>
                          <td
                            colSpan={canWriteTankCalibration && !isChartLocked ? 3 : 2}
                            className="py-6 text-center text-[#64748B]"
                          >
                            Loading calibration chart...
                          </td>
                        </tr>
                      ) : calPoints.length === 0 ? (
                        <tr>
                          <td
                            colSpan={canWriteTankCalibration && !isChartLocked ? 3 : 2}
                            className="py-6 text-center text-[#64748B]"
                          >
                            No calibration points configured for this tank yet.
                          </td>
                        </tr>
                      ) : (
                        calPoints.map(pt => (
                          <tr key={pt.id} className="hover:bg-[#F1F5F9]/40">
                            <td className="py-2 px-4 font-bold text-[#B8530D]">
                              {formatCalibrationDisplay(pt.dipMmStr ?? pt.dipMillimetresMilliunits / 1000)}
                            </td>
                            <td className="py-2 px-4 text-[#17365D]">
                              {formatCalibrationDisplay(pt.volumeLitreStr ?? pt.volumeMilliunits / 1000)}
                            </td>
                            {canWriteTankCalibration && !isChartLocked && (
                              <td className="py-2 px-4 text-right space-x-2">
                                <button
                                  type="button"
                                  disabled={modalSubmitting}
                                  onClick={() => startEditCalibrationPoint(pt)}
                                  className="inline-flex items-center gap-1 px-2 py-1 rounded bg-[#F1F5F9] hover:bg-[#E8EEF5] text-[#334155] border border-[#D7E0EA] text-[11px]"
                                >
                                  <Edit2 className="w-3 h-3 text-[#B8530D]" />
                                  <span>Edit</span>
                                </button>
                                <button
                                  type="button"
                                  disabled={modalSubmitting}
                                  onClick={() => handleDeleteCalibrationPoint(pt)}
                                  className="inline-flex items-center gap-1 px-2 py-1 rounded bg-rose-500/10 hover:bg-rose-500/20 text-rose-700 border border-rose-500/20 text-[11px]"
                                >
                                  <Trash2 className="w-3 h-3" />
                                  <span>Delete</span>
                                </button>
                              </td>
                            )}
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Dry-Run Comparison Against Original Printed IOCL Chart */}
              {calShowDryRun && (
                <div className="bg-slate-950/60 border border-cyan-500/30 rounded-xl p-4 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h4 className="text-xs font-bold text-cyan-300 font-mono uppercase flex items-center gap-1.5">
                        <FlaskConical className="w-3.5 h-3.5 text-cyan-400" />
                        <span>Dry-Run Comparison vs Printed IOCL Chart</span>
                      </h4>
                      <p className="text-[11px] text-[#64748B] mt-0.5">
                        Paste or upload reference checkpoints (<code className="text-cyan-300">dip_mm, printed_volume_litres</code>) from the scanned IOCL chart to verify exact and interpolated volume conversions before or after activation.
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={handleLoadSampleDryRunCheckpoints}
                        className="px-2.5 py-1 rounded-lg bg-[#F1F5F9] hover:bg-[#E8EEF5] text-cyan-300 border border-[#D7E0EA] text-[11px] font-mono font-semibold"
                      >
                        Load Sample Checkpoints
                      </button>
                      <label className="cursor-pointer inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-[#F1F5F9] hover:bg-[#E8EEF5] text-[#334155] border border-[#D7E0EA] text-[11px] font-mono font-semibold">
                        <Upload className="w-3 h-3 text-cyan-400" />
                        <span>Upload Checkpoints CSV</span>
                        <input
                          type="file"
                          accept=".csv,.txt,.tsv"
                          onChange={handleDryRunCsvUpload}
                          className="hidden"
                        />
                      </label>
                    </div>
                  </div>

                  <form onSubmit={handleRunDryRunComparison} className="space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <label className="block text-[10px] text-[#64748B] font-mono uppercase mb-1">
                          Compare Against
                        </label>
                        <select
                          value={calDryRunSource}
                          onChange={e => setCalDryRunSource(e.target.value as 'SAVED_CHART' | 'CSV_PREVIEW')}
                          className="w-full bg-[#F1F5F9] border border-[#D7E0EA] rounded-lg px-2.5 py-1.5 text-xs text-[#17365D] font-mono"
                        >
                          <option value="SAVED_CHART">
                            Selected Saved Revision ({calSelectedChart ? `Rev #${calSelectedChart.revisionNumber}` : 'Active Chart'})
                          </option>
                          <option value="CSV_PREVIEW">
                            Unsaved CSV Import Preview ({csvPreview?.normalizedPoints.length || 0} pts)
                          </option>
                        </select>
                      </div>
                      <div>
                        <label className="block text-[10px] text-[#64748B] font-mono uppercase mb-1">
                          Acceptable Tolerance (L)
                        </label>
                        <input
                          type="number"
                          step="0.001"
                          min="0"
                          value={calDryRunTolerance}
                          onChange={e => setCalDryRunTolerance(e.target.value)}
                          className="w-full bg-[#F1F5F9] border border-[#D7E0EA] rounded-lg px-2.5 py-1.5 text-xs text-[#17365D] font-mono"
                        />
                      </div>
                      <div className="flex items-end">
                        <button
                          type="submit"
                          disabled={modalSubmitting}
                          className="w-full py-1.5 px-3 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-[#17365D] rounded-lg text-xs font-bold font-mono"
                        >
                          {modalSubmitting ? 'Evaluating...' : 'Run Dry-Run Verification'}
                        </button>
                      </div>
                    </div>

                    <textarea
                      rows={4}
                      value={calDryRunText}
                      onChange={e => setCalDryRunText(e.target.value)}
                      placeholder={`dip_mm,printed_volume_litres\n0,0\n250,2500\n500,5000\n1250,12500\n2000,20000`}
                      className="w-full bg-[#F1F5F9] border border-[#D7E0EA] rounded-xl p-2.5 text-xs text-[#17365D] font-mono focus:outline-none focus:border-cyan-500"
                    />
                  </form>

                  {calDryRunReport && (
                    <div className="space-y-2 pt-2 border-t border-[#E2E8F0]">
                      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 text-[11px] font-mono">
                        <div className="p-2 bg-white rounded-lg border border-[#E2E8F0]">
                          <span className="text-[#64748B] block text-[10px]">CHECKPOINTS</span>
                          <span className="text-[#17365D] font-bold">{calDryRunReport.checkpointsCount}</span>
                        </div>
                        <div className="p-2 bg-emerald-500/10 rounded-lg border border-emerald-500/20">
                          <span className="text-emerald-700/80 block text-[10px]">PASSED (≤ {formatCalibrationDisplay(calDryRunReport.toleranceLitres)} L)</span>
                          <span className="text-emerald-800 font-bold">{calDryRunReport.passedCount}</span>
                        </div>
                        <div className="p-2 bg-rose-500/10 rounded-lg border border-rose-500/20">
                          <span className="text-rose-700/80 block text-[10px]">EXCEEDED / OUT OF RANGE</span>
                          <span className="text-rose-800 font-bold">{calDryRunReport.failedCount}</span>
                        </div>
                        <div className="p-2 bg-white rounded-lg border border-[#E2E8F0]">
                          <span className="text-[#64748B] block text-[10px]">MAX |DELTA|</span>
                          <span className="text-[#17365D] font-bold">{formatCalibrationDisplay(calDryRunReport.maxAbsDeltaLitres)} L</span>
                        </div>
                        <div className="p-2 bg-white rounded-lg border border-[#E2E8F0]">
                          <span className="text-[#64748B] block text-[10px]">MEAN |DELTA|</span>
                          <span className="text-[#17365D] font-bold">{formatCalibrationDisplay(calDryRunReport.meanAbsDeltaLitres)} L</span>
                        </div>
                      </div>

                      <div className="overflow-x-auto bg-white border border-[#E2E8F0] rounded-xl max-h-48">
                        <table className="w-full text-left text-[11px] font-mono">
                          <thead className="bg-[#F1F5F9]/80 text-[#64748B] uppercase text-[10px] border-b border-[#E2E8F0] sticky top-0">
                            <tr>
                              <th className="py-2 px-3">Dip (mm)</th>
                              <th className="py-2 px-3">Printed (L)</th>
                              <th className="py-2 px-3">Calculated (L)</th>
                              <th className="py-2 px-3">Mode</th>
                              <th className="py-2 px-3">Delta (L)</th>
                              <th className="py-2 px-3 text-right">Status</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-800/60">
                            {calDryRunReport.rows.map((r, idx) => (
                              <tr key={idx} className="hover:bg-[#F1F5F9]/40">
                                <td className="py-1.5 px-3 font-bold text-[#B8530D]">
                                  {formatCalibrationDisplay(r.dipMm)}
                                </td>
                                <td className="py-1.5 px-3 text-[#334155]">
                                  {formatCalibrationDisplay(r.printedVolumeLitres)}
                                </td>
                                <td className="py-1.5 px-3 text-[#17365D] font-semibold">
                                  {r.calculatedVolumeLitres !== null
                                    ? formatCalibrationDisplay(r.calculatedVolumeLitres)
                                    : '—'}
                                </td>
                                <td className="py-1.5 px-3">
                                  <span
                                    className={`px-1.5 py-0.5 rounded text-[10px] ${
                                      r.matchType === 'EXACT_POINT'
                                        ? 'bg-emerald-500/15 text-emerald-800'
                                        : r.matchType === 'INTERPOLATED'
                                          ? 'bg-cyan-500/15 text-cyan-300'
                                          : 'bg-rose-500/15 text-rose-800'
                                    }`}
                                  >
                                    {r.matchType}
                                  </span>
                                </td>
                                <td className="py-1.5 px-3 text-[#334155]">
                                  {r.deltaLitres !== null ? `${Number(r.deltaLitres) > 0 ? '+' : ''}${formatCalibrationDisplay(r.deltaLitres)} L` : r.error}
                                </td>
                                <td className="py-1.5 px-3 text-right">
                                  {r.withinTolerance ? (
                                    <span className="text-emerald-700 font-bold">PASS</span>
                                  ) : (
                                    <span className="text-rose-700 font-bold">FAIL</span>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Write Controls: Single Point Add/Edit & Bulk Import */}
              {canWriteTankCalibration ? (
                <div className="space-y-4 pt-2 border-t border-[#E2E8F0]">
                  {/* Single Point Add / Edit Form (Disabled if chart is referenced by historical readings) */}
                  {!isChartLocked && (
                    <form onSubmit={handleSaveCalibrationPoint} className="bg-[#F8FAFC]/60 border border-[#E2E8F0] rounded-xl p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <h4 className="text-xs font-bold text-[#17365D] font-mono uppercase">
                          {calEditingPoint
                            ? `Edit Point (${formatCalibrationDisplay(calEditingPoint.dipMmStr)} mm)`
                            : 'Add Calibration Point'}
                        </h4>
                        {calEditingPoint && (
                          <button
                            type="button"
                            onClick={cancelEditCalibrationPoint}
                            className="text-[11px] text-[#64748B] hover:text-[#17365D] font-mono"
                          >
                            Cancel Edit
                          </button>
                        )}
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
                        <div>
                          <label className="block text-[11px] text-[#64748B] font-mono mb-1">
                            Dip (mm)
                          </label>
                          <input
                            type="number"
                            step="0.001"
                            min="0"
                            placeholder="e.g. 500"
                            value={calDipInput}
                            onChange={e => {
                              setCalDipInput(e.target.value);
                              setModalError(null);
                            }}
                            className="w-full bg-[#F1F5F9] border border-[#D7E0EA] rounded-xl px-3 py-2 text-xs text-[#17365D] font-mono focus:outline-none focus:border-orange-500"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] text-[#64748B] font-mono mb-1">
                            Volume (L)
                          </label>
                          <input
                            type="number"
                            step="0.001"
                            min="0"
                            placeholder="e.g. 5000"
                            value={calVolumeInput}
                            onChange={e => {
                              setCalVolumeInput(e.target.value);
                              setModalError(null);
                            }}
                            className="w-full bg-[#F1F5F9] border border-[#D7E0EA] rounded-xl px-3 py-2 text-xs text-[#17365D] font-mono focus:outline-none focus:border-orange-500"
                          />
                        </div>
                        <div>
                          <button
                            type="submit"
                            disabled={modalSubmitting}
                            className="w-full py-2 px-4 bg-orange-500 hover:bg-orange-600 disabled:opacity-50 text-[#17365D] rounded-xl text-xs font-bold shadow-md shadow-orange-500/20"
                          >
                            {modalSubmitting
                              ? 'Saving...'
                              : calEditingPoint
                                ? 'Update Point'
                                : 'Add Point'}
                          </button>
                        </div>
                      </div>
                    </form>
                  )}

                  {/* CSV / Bulk Import Section with Metadata & Pre-Save Preview */}
                  {calShowBulkImport && (
                    <form
                      onSubmit={handleBulkImportCalibration}
                      className="bg-[#F8FAFC]/60 border border-[#E2E8F0] rounded-xl p-4 space-y-4"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div>
                          <h4 className="text-xs font-bold text-[#17365D] font-mono uppercase flex items-center gap-1.5">
                            <FileSpreadsheet className="w-3.5 h-3.5 text-[#B8530D]" />
                            <span>CSV / Bulk Import Calibration Chart</span>
                          </h4>
                          <p className="text-[11px] text-[#64748B] mt-0.5">
                            Paste rows as <code className="text-[#B8530D]">dip_mm,volume_litres</code> (non-linear or linear tables supported) or upload an IOCL calibration CSV file.
                            {isChartLocked && (
                              <span className="text-amber-800 block mt-0.5">
                                ℹ️ Because Rev #{calSelectedChart?.revisionNumber} is referenced by historical readings, importing will automatically create a new revision without overwriting historical data.
                              </span>
                            )}
                          </p>
                        </div>
                        <label className="cursor-pointer inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#F1F5F9] hover:bg-[#E8EEF5] text-[#334155] border border-[#D7E0EA] text-xs font-semibold">
                          <Upload className="w-3.5 h-3.5 text-[#B8530D]" />
                          <span>Upload CSV</span>
                          <input
                            type="file"
                            accept=".csv,.txt,.tsv"
                            onChange={handleCalibrationCsvUpload}
                            className="hidden"
                          />
                        </label>
                      </div>

                      {/* Chart Dimensions & Metadata Inputs */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1">
                        <div>
                          <label className="block text-[10px] text-[#64748B] font-mono uppercase mb-1">
                            Tank Diameter (mm)
                          </label>
                          <input
                            type="number"
                            step="0.001"
                            min="1"
                            placeholder="e.g. 2000"
                            value={calDiameterMmInput}
                            onChange={e => setCalDiameterMmInput(e.target.value)}
                            className="w-full bg-[#F1F5F9] border border-[#D7E0EA] rounded-lg px-2.5 py-1.5 text-xs text-[#17365D] font-mono"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] text-[#64748B] font-mono uppercase mb-1">
                            Tank Length (mm)
                          </label>
                          <input
                            type="number"
                            step="0.001"
                            min="1"
                            placeholder="e.g. 6600"
                            value={calLengthMmInput}
                            onChange={e => setCalLengthMmInput(e.target.value)}
                            className="w-full bg-[#F1F5F9] border border-[#D7E0EA] rounded-lg px-2.5 py-1.5 text-xs text-[#17365D] font-mono"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] text-[#64748B] font-mono uppercase mb-1">
                            Max Dip Limit (mm)
                          </label>
                          <input
                            type="number"
                            step="0.001"
                            min="1"
                            placeholder="e.g. 2000"
                            value={calMaxDipMmInput}
                            onChange={e => setCalMaxDipMmInput(e.target.value)}
                            className="w-full bg-[#F1F5F9] border border-[#D7E0EA] rounded-lg px-2.5 py-1.5 text-xs text-[#17365D] font-mono"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] text-[#64748B] font-mono uppercase mb-1">
                            Save Mode
                          </label>
                          <select
                            value={canApproveCalibrationChart ? calSaveMode : 'DRAFT'}
                            onChange={e => setCalSaveMode(e.target.value as 'ACTIVE' | 'DRAFT')}
                            disabled={!canApproveCalibrationChart}
                            className="w-full bg-[#F1F5F9] border border-[#D7E0EA] rounded-lg px-2.5 py-1.5 text-xs text-[#17365D] font-mono disabled:opacity-60"
                          >
                            <option value="DRAFT">Save as Draft Revision (DRAFT)</option>
                            {canApproveCalibrationChart && (
                              <option value="ACTIVE">Activate Immediately (ACTIVE)</option>
                            )}
                          </select>
                        </div>
                        <div>
                          <label className="block text-[10px] text-[#64748B] font-mono uppercase mb-1">
                            Source File Name
                          </label>
                          <input
                            type="text"
                            placeholder="e.g. iocl_tank1_20kl.csv"
                            value={calSourceFileName}
                            onChange={e => setCalSourceFileName(e.target.value)}
                            className="w-full bg-[#F1F5F9] border border-[#D7E0EA] rounded-lg px-2.5 py-1.5 text-xs text-[#17365D] font-mono"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] text-[#64748B] font-mono uppercase mb-1">
                            Calibration Cert / Ref Doc
                          </label>
                          <input
                            type="text"
                            placeholder="e.g. W&M/IOCL/2026/01"
                            value={calReferenceDocument}
                            onChange={e => setCalReferenceDocument(e.target.value)}
                            className="w-full bg-[#F1F5F9] border border-[#D7E0EA] rounded-lg px-2.5 py-1.5 text-xs text-[#17365D] font-mono"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] text-[#64748B] font-mono uppercase mb-1">
                            Effective From Date
                          </label>
                          <input
                            type="date"
                            value={calEffectiveFrom}
                            onChange={e => setCalEffectiveFrom(e.target.value)}
                            className="w-full bg-[#F1F5F9] border border-[#D7E0EA] rounded-lg px-2.5 py-1.5 text-xs text-[#17365D] font-mono"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] text-[#64748B] font-mono uppercase mb-1">
                            Revision Notes
                          </label>
                          <input
                            type="text"
                            placeholder="Optional notes"
                            value={calNotes}
                            onChange={e => setCalNotes(e.target.value)}
                            className="w-full bg-[#F1F5F9] border border-[#D7E0EA] rounded-lg px-2.5 py-1.5 text-xs text-[#17365D] font-mono"
                          />
                        </div>
                      </div>

                      <textarea
                        rows={6}
                        value={calBulkText}
                        onChange={e => {
                          setCalBulkText(e.target.value);
                          setCalShowPreview(true);
                          setModalError(null);
                        }}
                        placeholder={`dip_mm,volume_litres\n0,0\n500,5000\n1000,10000\n1500,15000\n2000,20000`}
                        className="w-full bg-[#F1F5F9] border border-[#D7E0EA] rounded-xl p-3 text-xs text-[#17365D] font-mono focus:outline-none focus:border-orange-500"
                      />

                      {/* Pre-Save CSV Validation & Preview Panel */}
                      {calShowPreview && csvPreview && (
                        <div className="p-3 bg-white border border-[#E2E8F0] rounded-xl space-y-2.5 font-mono text-xs">
                          <div className="flex items-center justify-between">
                            <span className="font-bold uppercase text-[11px] text-[#475569]">
                              Pre-Save Import Preview & Validation
                            </span>
                            {csvPreview.valid ? (
                              <span className="px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-800 text-[10px] font-bold">
                                VALID ({csvPreview.diagnostics.pointsCount} POINTS)
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded bg-rose-500/15 text-rose-800 text-[10px] font-bold">
                                VALIDATION FAILED
                              </span>
                            )}
                          </div>

                          {!csvPreview.valid && csvPreview.error && (
                            <div className="text-rose-700 text-[11px]">
                              ❌ {csvPreview.error}
                            </div>
                          )}

                          {csvPreview.valid && (
                            <>
                              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px]">
                                <div className="p-2 bg-slate-950/60 rounded border border-[#E2E8F0]">
                                  <span className="text-[#64748B] block text-[10px]">DIP RANGE</span>
                                  <span className="text-[#B8530D] font-bold">
                                    {formatCalibrationDisplay(csvPreview.diagnostics.minDipMm)} – {formatCalibrationDisplay(csvPreview.diagnostics.maxDipMm)} mm
                                  </span>
                                </div>
                                <div className="p-2 bg-slate-950/60 rounded border border-[#E2E8F0]">
                                  <span className="text-[#64748B] block text-[10px]">VOLUME RANGE</span>
                                  <span className="text-[#17365D] font-bold">
                                    {formatCalibrationDisplay(csvPreview.diagnostics.minVolumeLitres)} – {formatCalibrationDisplay(csvPreview.diagnostics.maxVolumeLitres)} L
                                  </span>
                                </div>
                                <div className="p-2 bg-slate-950/60 rounded border border-[#E2E8F0]">
                                  <span className="text-[#64748B] block text-[10px]">DOMINANT STEP</span>
                                  <span className="text-[#334155]">
                                    {csvPreview.diagnostics.dominantStepMm
                                      ? `${formatCalibrationDisplay(csvPreview.diagnostics.dominantStepMm)} mm`
                                      : '—'}
                                    {csvPreview.diagnostics.isUniformStep ? ' (Uniform)' : ' (Variable)'}
                                  </span>
                                </div>
                                <div className="p-2 bg-slate-950/60 rounded border border-[#E2E8F0]">
                                  <span className="text-[#64748B] block text-[10px]">CURVE GEOMETRY</span>
                                  <span className="text-cyan-300">
                                    {csvPreview.diagnostics.isNonLinear ? 'Non-Linear Table' : 'Linear Table'}
                                  </span>
                                </div>
                              </div>

                              {csvPreview.diagnostics.missingStepWarnings.length > 0 && (
                                <div className="p-2 bg-amber-500/10 border border-amber-500/25 rounded text-[11px] text-amber-200 space-y-0.5">
                                  <div className="font-bold">
                                    ⚠️ Missing Step / Interval Warnings ({csvPreview.diagnostics.missingStepWarnings.length}):
                                  </div>
                                  {csvPreview.diagnostics.missingStepWarnings.slice(0, 3).map((w, idx) => (
                                    <div key={idx}>• {w.message}</div>
                                  ))}
                                </div>
                              )}

                              <div className="max-h-36 overflow-y-auto border border-[#E2E8F0] rounded-lg">
                                <table className="w-full text-left text-[11px]">
                                  <thead className="bg-[#F1F5F9]/80 text-[#64748B] text-[10px] sticky top-0">
                                    <tr>
                                      <th className="py-1.5 px-3">#</th>
                                      <th className="py-1.5 px-3">Dip (mm)</th>
                                      <th className="py-1.5 px-3">Volume (L)</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-slate-800/60">
                                    {csvPreview.normalizedPoints.slice(0, 10).map((pt, idx) => (
                                      <tr key={idx}>
                                        <td className="py-1 px-3 text-[#64748B]">{idx + 1}</td>
                                        <td className="py-1 px-3 text-[#B8530D]">{formatCalibrationDisplay(pt.dipMillimetres)}</td>
                                        <td className="py-1 px-3 text-[#17365D]">{formatCalibrationDisplay(pt.volumeLitres)}</td>
                                      </tr>
                                    ))}
                                    {csvPreview.normalizedPoints.length > 10 && (
                                      <tr>
                                        <td colSpan={3} className="py-1.5 px-3 text-center text-[#64748B]">
                                          ... +{csvPreview.normalizedPoints.length - 10} more rows (final row: {formatCalibrationDisplay(csvPreview.normalizedPoints[csvPreview.normalizedPoints.length - 1].dipMillimetres)} mm → {formatCalibrationDisplay(csvPreview.normalizedPoints[csvPreview.normalizedPoints.length - 1].volumeLitres)} L)
                                        </td>
                                      </tr>
                                    )}
                                  </tbody>
                                </table>
                              </div>
                            </>
                          )}
                        </div>
                      )}

                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <label className="inline-flex items-center gap-2 text-[11px] text-[#64748B] font-mono">
                          <input
                            type="checkbox"
                            checked={calAllowOverCapacity}
                            onChange={e => setCalAllowOverCapacity(e.target.checked)}
                            className="rounded border-[#D7E0EA] bg-[#F1F5F9] text-orange-500"
                          />
                          <span>Allow volume above nominal tank capacity ({calibratingTank.capacityLitres.toLocaleString()} L)</span>
                        </label>

                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => setCalShowPreview(prev => !prev)}
                            className="px-3 py-1.5 bg-[#F1F5F9] hover:bg-[#E8EEF5] rounded-xl text-xs text-cyan-300 font-mono font-semibold"
                          >
                            {calShowPreview ? 'Hide Preview' : 'Preview CSV'}
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setCalShowBulkImport(false);
                              setModalError(null);
                            }}
                            className="px-3 py-1.5 bg-[#F1F5F9] rounded-xl text-xs text-[#475569]"
                          >
                            Cancel
                          </button>
                          <button
                            type="submit"
                            disabled={modalSubmitting}
                            className="px-4 py-1.5 bg-gradient-to-r from-orange-500 to-amber-600 disabled:opacity-50 text-[#17365D] rounded-xl text-xs font-bold shadow-md shadow-orange-500/20"
                          >
                            {modalSubmitting
                              ? 'Importing...'
                              : isChartLocked
                                ? `Save as New ${calSaveMode} Revision`
                                : calSaveMode === 'DRAFT'
                                  ? 'Save as Draft Revision'
                                  : 'Save & Activate Chart'}
                          </button>
                        </div>
                      </div>
                    </form>
                  )}
                </div>
              ) : (
                <div className="p-3 bg-[#F8FAFC]/60 border border-[#E2E8F0] rounded-xl text-xs text-[#64748B] font-mono">
                  Read-only view (TANK_CALIBRATION_READ). Contact an administrator or authorized officer with TANK_CALIBRATION_WRITE to modify calibration points.
                </div>
              )}

              <div className="flex justify-end pt-2 border-t border-[#E2E8F0]">
                <button
                  type="button"
                  onClick={() => setModalType(null)}
                  className="px-4 py-2 bg-[#F1F5F9] hover:bg-[#E8EEF5] rounded-xl text-xs text-[#334155] font-semibold"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
};
