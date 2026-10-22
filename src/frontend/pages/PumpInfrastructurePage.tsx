import React, { useState, useEffect } from 'react';
import { apiFetch } from '../services/api';
import { useAuth } from '../context/AuthContext';
import {
  RetailOutlet,
  Product,
  OutletProduct,
  Tank,
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
  Network,
  AlertTriangle,
  CheckCircle,
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
} from '../components/pump/pumpInfrastructureUi';
import { PERMISSIONS } from '../../shared/constants';

import { useActiveOutlet } from '../context/ActiveOutletContext';

export const PumpInfrastructurePage: React.FC = () => {
  const { userCtx, hasPermission } = useAuth();
  const canWriteProducts = hasPermission(PERMISSIONS.OUTLET_PRODUCTS_WRITE);
  const canWriteTanks = hasPermission(PERMISSIONS.TANKS_WRITE);
  const canWriteDispensers = hasPermission(PERMISSIONS.DISPENSERS_WRITE);
  const canWriteNozzles = hasPermission(PERMISSIONS.NOZZLES_WRITE);
  const canWriteShifts = hasPermission(PERMISSIONS.SHIFT_TEMPLATES_WRITE);

  const { activeOutletId, accessibleOutlets: outlets, loading: loadingOutlets, setActiveOutletId } = useActiveOutlet();
  const selectedOutletId = activeOutletId || '';
  const setSelectedOutletId = setActiveOutletId;

  // Active Sub-tab
  const [activeTab, setActiveTab] = useState<'products' | 'tanks' | 'dispensers' | 'nozzles' | 'shifts' | 'fuelMapping'>('products');

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
    'mapProduct' | 'addTank' | 'editTank' | 'addDispenser' | 'editDispenser' | 'addNozzle' | 'editNozzle' | 'addShift' | 'editShift' | null
  >(null);
  const [modalSubmitting, setModalSubmitting] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

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
    if (tRes.success && tRes.data) setTanks(tRes.data); else failures.push('tanks');
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
      <div className="py-16 text-center text-slate-500 text-sm font-mono flex items-center justify-center gap-2">
        <RefreshCw className="w-4 h-4 animate-spin text-orange-500" />
        Loading accessible retail outlets...
      </div>
    );
  }

  if (outlets.length === 0) {
    return (
      <div className="p-8 text-center bg-slate-900 border border-slate-800 rounded-2xl">
        <Building2 className="w-12 h-12 text-slate-600 mx-auto mb-3" />
        <h2 className="text-base font-bold text-white">No Retail Outlets In Your Scope</h2>
        <p className="text-xs text-slate-400 mt-1">You do not have scope access to manage retail outlets.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top Header & Outlet Selector */}
      <div className="bg-slate-900 border border-slate-800/80 rounded-2xl p-5 shadow-xl shadow-black/20">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <Building2 className="w-5 h-5 text-orange-500" />
              <h1 className="text-xl font-black text-white tracking-tight">
                Pump Operations Infrastructure
              </h1>
            </div>
            <p className="text-xs text-slate-400 mt-1">
              Configure Tanks, Multi-Product Dispensers, Nozzles, and Shift Timing for your outlet
            </p>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-xs font-mono font-semibold text-slate-400">Select Outlet:</span>
            <select
              value={selectedOutletId}
              onChange={(e) => setSelectedOutletId(e.target.value)}
              className="bg-slate-800 border border-slate-700 text-white rounded-xl px-3 py-2 text-xs sm:text-sm font-semibold focus:outline-none focus:border-orange-500"
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
          <div className="mt-4 pt-4 border-t border-slate-800/80 flex flex-wrap items-center gap-4 text-xs font-mono">
            <div className="flex items-center gap-1.5 text-slate-300">
              <span className="text-slate-500">TYPE:</span>
              <span className="font-bold text-orange-400">{selectedOutlet.outletType}</span>
            </div>
            <div className="flex items-center gap-1.5 text-slate-300">
              <MapPin className="w-3.5 h-3.5 text-slate-500" />
              <span>{selectedOutlet.city}, {selectedOutlet.district}</span>
            </div>
            <div className="flex items-center gap-1.5 text-slate-300">
              <span className="text-slate-500">PIN:</span>
              <span>{selectedOutlet.pincode}</span>
            </div>
            <div className="ml-auto flex items-center gap-2">
              <button
                onClick={loadOutletData}
                className="flex items-center gap-1 text-[11px] text-slate-400 hover:text-white px-2 py-1 rounded bg-slate-800 border border-slate-700"
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
        <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl text-emerald-400 text-xs sm:text-sm flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{successMsg}</span>
        </div>
      )}
      {error && (
        <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-400 text-xs sm:text-sm flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Sub-tab Navigation */}
      <div className="flex items-center gap-1 border-b border-slate-800 pb-2 overflow-x-auto">
        <button
          onClick={() => setActiveTab('products')}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
            activeTab === 'products'
              ? 'bg-orange-500 text-white shadow-md shadow-orange-500/20'
              : 'text-slate-400 hover:text-white hover:bg-slate-900'
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
              : 'text-slate-400 hover:text-white hover:bg-slate-900'
          }`}
        >
          <Gauge className="w-3.5 h-3.5" />
          <span>Underground Tanks ({tanks.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('dispensers')}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all whitespace-nowrap ${
            activeTab === 'dispensers'
              ? 'bg-orange-500 text-white shadow-md shadow-orange-500/20'
              : 'text-slate-400 hover:text-white hover:bg-slate-900'
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
              : 'text-slate-400 hover:text-white hover:bg-slate-900'
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
              : 'text-slate-400 hover:text-white hover:bg-slate-900'
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
              : 'text-slate-400 hover:text-white hover:bg-slate-900'
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
            <h2 className="text-sm font-bold text-white uppercase tracking-wider font-mono">
              Retail Outlet Fuel Products
            </h2>
            {canWriteProducts && (
              <button
                onClick={() => {
                  setSelectedProductId(catalogProducts[0]?.id || '');
                  setModalError(null);
                  setModalType('mapProduct');
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-orange-500 to-amber-600 text-white rounded-lg text-xs font-bold shadow-md shadow-orange-500/20"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Map New Product</span>
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {outletProducts.map(op => (
              <div key={op.id} className="bg-slate-900 border border-slate-800 rounded-2xl p-4 flex items-center justify-between">
                <div>
                  <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-slate-800 text-orange-400 border border-slate-700">
                    {op.product?.code || 'FUEL'}
                  </span>
                  <div className="text-sm font-bold text-white mt-2">
                    {op.product?.name || 'Product'}
                  </div>
                  <div className="text-xs text-slate-400 font-mono mt-0.5">
                    Unit: {op.product?.unit} • Category: {op.product?.category}
                  </div>
                </div>
                <div className="flex flex-col items-end">
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold border bg-emerald-500/10 text-emerald-400 border-emerald-500/20">
                    Active
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 2. UNDERGROUND TANKS */}
      {activeTab === 'tanks' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-white uppercase tracking-wider font-mono">
              Underground Storage Tanks (UST)
            </h2>
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
                className="flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-orange-500 to-amber-600 text-white rounded-lg text-xs font-bold shadow-md shadow-orange-500/20"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Storage Tank</span>
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {tanks.map(t => {
              const safeFillPercent = Math.min(100, Math.round((t.safeFillCapacityLitres / t.capacityLitres) * 100));
              return (
                <div key={t.id} className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 rounded bg-slate-800 text-orange-400 font-mono text-xs font-bold border border-slate-700">
                          Tank #{t.tankNumber}
                        </span>
                        <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                          {t.productCode || t.productName}
                        </span>
                      </div>
                      <h3 className="text-base font-bold text-white mt-1.5">{t.name}</h3>
                    </div>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold border bg-emerald-500/10 text-emerald-400 border-emerald-500/20">
                      {t.status}
                    </span>
                  </div>

                  {/* Visual Safe Fill Capacity Meter */}
                  <div>
                    <div className="flex justify-between text-xs text-slate-400 font-mono mb-1">
                      <span>Safe Fill Limit: {t.safeFillCapacityLitres.toLocaleString()} L</span>
                      <span>Total: {t.capacityLitres.toLocaleString()} L</span>
                    </div>
                    <div className="w-full bg-slate-800 rounded-full h-3 overflow-hidden border border-slate-700/80">
                      <div
                        className="bg-gradient-to-r from-blue-500 to-amber-500 h-full rounded-full"
                        style={{ width: `${safeFillPercent}%` }}
                      />
                    </div>
                  </div>

                  <div className="pt-2 border-t border-slate-800 grid grid-cols-2 gap-2 text-xs font-mono">
                    <div>
                      <span className="text-slate-500 block text-[10px]">MIN OPERATING LEVEL</span>
                      <span className="text-slate-200">{t.minimumOperatingLevelLitres.toLocaleString()} Litres</span>
                    </div>
                    <div>
                      <span className="text-slate-500 block text-[10px]">COMMISSIONED</span>
                      <span className="text-slate-200">{t.commissionedAt ? new Date(t.commissionedAt).toLocaleDateString() : 'N/A'}</span>
                    </div>
                  </div>

                  {canWriteTanks && (
                    <div className="pt-2 border-t border-slate-800/80">
                      <button
                        onClick={() => openEditTank(t)}
                        className="w-full flex items-center justify-center gap-1.5 py-1.5 bg-slate-800/80 hover:bg-slate-700/80 text-slate-300 hover:text-white rounded-xl text-xs font-semibold transition-colors"
                      >
                        <Edit2 className="w-3.5 h-3.5 text-orange-400" />
                        <span>Edit Tank</span>
                      </button>
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
            <h2 className="text-sm font-bold text-white uppercase tracking-wider font-mono">
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
                className="flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-orange-500 to-amber-600 text-white rounded-lg text-xs font-bold shadow-md shadow-orange-500/20"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Dispenser</span>
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {dispensers.map(d => (
              <div key={d.id} className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <span className="px-2.5 py-1 rounded bg-slate-800 text-orange-400 font-mono text-xs font-bold border border-slate-700">
                      MPD #{d.dispenserNumber}
                    </span>
                    <span className="px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 font-mono text-[10px] font-bold border border-blue-500/20">
                      {d.nozzleCapacity || 6}-Nozzle DU
                    </span>
                  </div>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold border bg-emerald-500/10 text-emerald-400 border-emerald-500/20">
                    {d.status}
                  </span>
                </div>

                <div>
                  <h3 className="text-sm font-bold text-white">{d.name}</h3>
                  <div className="text-xs text-slate-400 mt-0.5">
                    {d.manufacturer || 'Standard'} {d.model && `• ${d.model}`}
                  </div>
                </div>

                <div className="pt-2 border-t border-slate-800 grid grid-cols-2 gap-2 text-xs font-mono">
                  <div>
                    <span className="text-slate-500 block text-[10px]">SERIAL NO.</span>
                    <span className="text-slate-300 font-bold truncate block">{d.serialNumber || 'N/A'}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[10px]">CONNECTED NOZZLES</span>
                    <span className="text-orange-400 font-bold">
                      {d.nozzlesCount || 0} / {d.nozzleCapacity || 6}
                    </span>
                  </div>
                </div>

                {canWriteDispensers && (
                  <div className="pt-2 border-t border-slate-800/80">
                    <button
                      onClick={() => openEditDispenser(d)}
                      className="w-full flex items-center justify-center gap-1.5 py-1.5 bg-slate-800/80 hover:bg-slate-700/80 text-slate-300 hover:text-white rounded-xl text-xs font-semibold transition-colors"
                    >
                      <Edit2 className="w-3.5 h-3.5 text-orange-400" />
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
            <h2 className="text-sm font-bold text-white uppercase tracking-wider font-mono">
              Fuel Delivery Nozzles
            </h2>
            {canWriteNozzles && (
              <button
                onClick={() => openAddNozzleModal()}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-orange-500 to-amber-600 text-white rounded-lg text-xs font-bold shadow-md shadow-orange-500/20"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Configure Nozzle</span>
              </button>
            )}
          </div>

          {nozzleDiagnostics && nozzleDiagnostics.orphanNozzlesCount > 0 && (
            <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-2xl space-y-2">
              <div className="flex items-center gap-2 text-amber-400 text-xs font-bold font-mono">
                <AlertTriangle className="w-4 h-4 shrink-0" />
                <span>
                  HIDDEN / ORPHAN NOZZLE TOPOLOGY DETECTED ({nozzleDiagnostics.orphanNozzlesCount})
                </span>
              </div>
              <div className="space-y-2">
                {nozzleDiagnostics.orphanNozzles.map((orp: NozzleDiagnosticItem) => (
                  <div
                    key={orp.id}
                    className="flex flex-wrap items-center justify-between gap-2 bg-slate-900/80 border border-slate-800 rounded-xl px-3 py-2 text-xs font-mono"
                  >
                    <div className="text-slate-300">
                      <span className="font-bold text-amber-400">
                        MPD #{orp.dispenserNumber || '?'} / Nozzle {orp.nozzleNumber}
                      </span>{' '}
                      • Status: <span className="text-rose-400">{orp.integrityStatus}</span>{' '}
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
            <div className="p-3.5 bg-slate-900/90 border border-slate-800 rounded-2xl flex flex-wrap items-center gap-2 text-xs">
              <span className="text-slate-400 font-mono text-[11px] mr-1">Unconfigured DU Positions:</span>
              {dispensers.map(d => {
                const duNozzles = nozzles.filter(n => n.dispenserId === d.id);
                const missingNums = getAvailableNozzleNumbers(d.nozzleCapacity, duNozzles);
                return missingNums.map(num => (
                  <button
                    key={`${d.id}-${num}`}
                    onClick={() => openAddNozzleModal(d.id, num)}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-orange-400 border border-slate-700 font-mono text-[11px] font-bold transition-colors"
                  >
                    <Plus className="w-3 h-3" />
                    <span>MPD #{d.dispenserNumber} / Nozzle {num}</span>
                  </button>
                ));
              })}
            </div>
          )}

          <div className="overflow-x-auto bg-slate-900 border border-slate-800 rounded-2xl">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-800/60 text-slate-400 font-mono uppercase text-[10px] border-b border-slate-800">
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
                  <tr key={n.id} className="hover:bg-slate-800/30 transition-colors">
                    <td className="py-3 px-4 font-medium text-white">
                      MPD #{n.dispenserNumber} ({n.dispenserName || `DU #${n.dispenserNumber}`})
                    </td>
                    <td className="py-3 px-4 font-mono font-bold text-orange-400">
                      Nozzle {n.nozzleNumber}
                    </td>
                    <td className="py-3 px-4">
                      <span className="px-2 py-0.5 rounded font-mono font-bold bg-amber-500/10 text-amber-400 border border-amber-500/20">
                        {n.productCode || n.productName}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-slate-300 font-mono">
                      Tank #{n.tankNumber} ({n.tankName || `Tank #${n.tankNumber}`})
                    </td>
                    <td className="py-3 px-4">
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                        n.status === 'ACTIVE'
                          ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                          : n.status === 'MAINTENANCE'
                          ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                          : 'bg-slate-800 text-slate-400 border-slate-700'
                      }`}>
                        {n.status}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right">
                      {canWriteNozzles ? (
                        <button
                          onClick={() => openEditNozzle(n)}
                          className="inline-flex items-center gap-1.5 px-3 py-1 bg-slate-800 hover:bg-slate-700 text-orange-400 hover:text-orange-300 border border-slate-700 rounded-lg text-xs font-semibold transition-colors"
                        >
                          <Edit2 className="w-3 h-3" />
                          <span>Edit Mapping</span>
                        </button>
                      ) : (
                        <span className="text-[11px] text-slate-500 italic">Read-only</span>
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
              <h2 className="text-sm font-bold text-white uppercase tracking-wider font-mono">
                Global Shift Master
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
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
                className="flex items-center gap-1.5 px-3 py-1.5 bg-gradient-to-r from-orange-500 to-amber-600 text-white rounded-lg text-xs font-bold shadow-md shadow-orange-500/20"
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
                <div key={s.id} className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded font-mono font-bold text-orange-400 bg-slate-800 border border-slate-700 text-xs">
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
                          ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                          : 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                      }`}
                    >
                      {s.status || 'ACTIVE'}
                    </span>
                  </div>
                  <h3 className="text-base font-bold text-white">{s.name}</h3>
                  <div className="pt-2 border-t border-slate-800 flex items-center justify-between text-xs font-mono text-slate-300">
                    <div className="flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-orange-400" />
                      <span>{s.startTime} → {s.endTime}</span>
                    </div>
                    <span className="text-slate-500">Seq #{s.sequence}</span>
                  </div>

                  {canWriteShifts && (
                    <div className="pt-2 border-t border-slate-800/80 flex items-center gap-2">
                      <button
                        onClick={() => openEditShift(s)}
                        className="flex-1 flex items-center justify-center gap-1.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-xl text-xs font-semibold transition"
                      >
                        <Edit2 className="w-3.5 h-3.5 text-orange-400" />
                        <span>Edit Shift</span>
                      </button>
                      <button
                        onClick={() => handleToggleShiftStatus(s)}
                        className={`px-3 py-1.5 rounded-xl text-xs font-semibold border transition ${
                          isActive
                            ? 'bg-rose-500/10 text-rose-400 border-rose-500/20 hover:bg-rose-500/20'
                            : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20 hover:bg-emerald-500/20'
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
                <h2 className="text-sm font-bold text-white uppercase tracking-wider font-mono flex items-center gap-2">
                  <Network className="w-4 h-4 text-orange-400" />
                  <span>Physical Fuel Topology Tree (PRODUCT → TANK → DU → NOZZLE)</span>
                </h2>
                <p className="text-xs text-slate-400 mt-1">
                  Hierarchical physical mapping derived from active tanks, DUs, and configured nozzles.
                </p>
              </div>
            </div>

            {/* Warnings Summary Panel */}
            {mappingTree.warningsSummary.length > 0 && (
              <div className="bg-amber-500/10 border border-amber-500/20 rounded-2xl p-4 space-y-2">
                <div className="flex items-center gap-2 text-amber-400 text-xs font-bold font-mono">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>TOPOLOGY AUDIT WARNINGS ({mappingTree.warningsSummary.length})</span>
                </div>
                <ul className="list-disc list-inside space-y-1 text-xs text-amber-300/80 font-mono">
                  {mappingTree.warningsSummary.map((warn, idx) => (
                    <li key={idx}>{warn}</li>
                  ))}
                </ul>
              </div>
            )}

            {/* Product Mapping Nodes */}
            <div className="space-y-6">
              {mappingTree.products.map(pNode => (
                <div key={pNode.product.id} className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-4">
                  {/* Product Header */}
                  <div className="flex items-center justify-between pb-3 border-b border-slate-800">
                    <div className="flex items-center gap-3">
                      <span className={`px-2.5 py-1 rounded font-mono text-xs font-bold border ${getProductCategoryBadgeClass(pNode.product.category)}`}>
                        {pNode.product.code}
                      </span>
                      <div>
                        <h3 className="text-sm font-bold text-white">{pNode.product.name}</h3>
                        <span className="text-[10px] text-slate-400 font-mono">Category: {pNode.product.category} • Unit: {pNode.product.unit}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-3 font-mono text-xs">
                      <span className="text-slate-400">Tanks: <strong className="text-slate-200">{pNode.totalTanksCount}</strong></span>
                      <span className="text-slate-400">Nozzles: <strong className="text-orange-400">{pNode.totalNozzlesCount}</strong></span>
                    </div>
                  </div>

                  {/* Product Node Warnings */}
                  {pNode.warnings.map((w, idx) => (
                    <div key={idx} className="p-3 bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs rounded-xl font-mono flex items-center gap-2">
                      <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                      <span>{w}</span>
                    </div>
                  ))}

                  {/* Tanks under Product */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pl-2 border-l-2 border-slate-800">
                    {pNode.tanks.map(tNode => (
                      <div key={tNode.tank.id} className="bg-slate-950/60 border border-slate-800/80 rounded-xl p-4 space-y-3">
                        <div className="flex items-start justify-between">
                          <div>
                            <span className="px-2 py-0.5 rounded bg-slate-800 text-orange-400 font-mono text-[10px] font-bold border border-slate-700">
                              Tank #{tNode.tank.tankNumber}
                            </span>
                            <h4 className="text-xs font-bold text-white mt-1">{tNode.tank.name}</h4>
                          </div>
                          <span className="px-1.5 py-0.5 rounded-full text-[9px] font-bold border bg-emerald-500/10 text-emerald-400 border-emerald-500/20">
                            {tNode.tank.status}
                          </span>
                        </div>

                        <div className="text-[10px] font-mono text-slate-400 flex justify-between">
                          <span>Safe Fill: {tNode.tank.safeFillCapacityLitres.toLocaleString()} L</span>
                          <span>Cap: {tNode.tank.capacityLitres.toLocaleString()} L</span>
                        </div>

                        {/* Tank Warnings */}
                        {tNode.warnings.map((w, idx) => (
                          <div key={idx} className="p-2 bg-amber-500/10 border border-amber-500/20 text-amber-400 text-[10px] font-mono rounded-lg">
                            ⚠️ {w}
                          </div>
                        ))}

                        {/* DUs connected to Tank */}
                        {tNode.connectedDus.length > 0 && (
                          <div className="space-y-2 pt-2 border-t border-slate-800/60">
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider font-mono">Connected Dispensing Units</span>
                            {tNode.connectedDus.map(duNode => (
                              <div key={duNode.dispenser.id} className="bg-slate-900 border border-slate-800 rounded-lg p-3 space-y-2">
                                <div className="flex items-center justify-between text-xs">
                                  <div className="flex items-center gap-1.5">
                                    <span className="font-mono font-bold text-slate-200">DU #{duNode.dispenser.dispenserNumber}</span>
                                    <span className="text-[10px] font-mono text-blue-400 bg-blue-500/10 px-1.5 py-0.5 rounded border border-blue-500/20">
                                      {duNode.duTypeLabel}
                                    </span>
                                  </div>
                                  <span className="text-[10px] font-mono text-slate-400">
                                    {duNode.utilization.ratioText}
                                  </span>
                                </div>

                                {/* DU Warnings */}
                                {duNode.warnings.map((w, idx) => (
                                  <div key={idx} className="text-[9px] font-mono text-amber-400/80">
                                    ℹ️ {w}
                                  </div>
                                ))}

                                {/* Nozzles List */}
                                <div className="flex flex-wrap gap-1.5 pt-1">
                                  {duNode.nozzles.map(nNode => (
                                    <span key={nNode.id} className="px-2 py-0.5 bg-slate-800 text-orange-400 border border-slate-700 text-[10px] font-bold font-mono rounded">
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
              <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 space-y-3">
                <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider font-mono flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-400" />
                  <span>Unassigned Dispensing Units (0 Configured Nozzles)</span>
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                  {mappingTree.unassignedDispensers.map(duNode => (
                    <div key={duNode.dispenser.id} className="bg-slate-950 border border-slate-800 rounded-xl p-3 text-xs space-y-1">
                      <div className="flex justify-between font-mono font-bold text-white">
                        <span>DU #{duNode.dispenser.dispenserNumber}</span>
                        <span className="text-blue-400">{duNode.duTypeLabel}</span>
                      </div>
                      <div className="text-[10px] text-slate-400">{duNode.dispenser.name}</div>
                      <div className="text-[10px] font-mono text-amber-400">0 / {duNode.utilization.capacity} nozzles configured</div>
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
          <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm" onClick={() => setModalType(null)} />
          <div className="relative z-10 w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl">
            <h2 className="text-lg font-bold text-white mb-2">Map Fuel Product to Outlet</h2>
            {modalError && <div className="p-3 mb-3 bg-rose-500/10 text-rose-400 text-xs rounded-xl">{modalError}</div>}
            <form onSubmit={handleMapProduct} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">Select Catalog Product</label>
                <select
                  value={selectedProductId}
                  onChange={(e) => setSelectedProductId(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs sm:text-sm text-slate-200"
                >
                  {catalogProducts.map(p => (
                    <option key={p.id} value={p.id}>
                      {p.code} - {p.name} ({p.unit})
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex justify-end gap-2 pt-3">
                <button type="button" onClick={() => setModalType(null)} className="px-4 py-2 bg-slate-800 rounded-xl text-xs text-slate-300">Cancel</button>
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
          <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm" onClick={() => setModalType(null)} />
          <div className="relative z-10 w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl">
            <h2 className="text-lg font-bold text-white mb-2">Register Underground Storage Tank</h2>
            {modalError && <div className="p-3 mb-3 bg-rose-500/10 text-rose-400 text-xs rounded-xl">{modalError}</div>}
            <form onSubmit={handleAddTank} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-slate-300 mb-1">Tank Number</label>
                  <input
                    type="number"
                    value={tankNumber}
                    onChange={(e) => setTankNumber(Number(e.target.value))}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-300 mb-1">Fuel Grade</label>
                  <select
                    value={selectedProductId}
                    onChange={(e) => setSelectedProductId(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
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
                <label className="block text-xs text-slate-300 mb-1">Tank Name</label>
                <input
                  type="text"
                  value={tankName}
                  onChange={(e) => setTankName(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                />
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-[10px] text-slate-400 mb-1">Total Cap (L)</label>
                  <input
                    type="number"
                    value={tankCapacity}
                    onChange={(e) => setTankCapacity(Number(e.target.value))}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-2 py-1.5 text-xs text-white"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-slate-400 mb-1">Safe Fill (L)</label>
                  <input
                    type="number"
                    value={tankSafeFill}
                    onChange={(e) => setTankSafeFill(Number(e.target.value))}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-2 py-1.5 text-xs text-white"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-slate-400 mb-1">Min Level (L)</label>
                  <input
                    type="number"
                    value={tankMinOperating}
                    onChange={(e) => setTankMinOperating(Number(e.target.value))}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-2 py-1.5 text-xs text-white"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-3">
                <button type="button" onClick={() => setModalType(null)} className="px-4 py-2 bg-slate-800 rounded-xl text-xs text-slate-300">Cancel</button>
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
          <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm" onClick={() => setModalType(null)} />
          <div className="relative z-10 w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl">
            <h2 className="text-lg font-bold text-white mb-2">Register Dispensing Unit (DU)</h2>
            {modalError && <div className="p-3 mb-3 bg-rose-500/10 text-rose-400 text-xs rounded-xl">{modalError}</div>}
            <form onSubmit={handleAddDispenser} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-slate-300 mb-1">DU # / Number</label>
                  <input
                    type="number"
                    value={dispNumber}
                    onChange={(e) => setDispNumber(Number(e.target.value))}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-300 mb-1">DU Name</label>
                  <input
                    type="text"
                    value={dispName}
                    onChange={(e) => setDispName(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-slate-300 mb-1">Manufacturer / Make</label>
                  <input
                    type="text"
                    value={dispManufacturer}
                    onChange={(e) => setDispManufacturer(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-300 mb-1">Model</label>
                  <input
                    type="text"
                    value={dispModel}
                    onChange={(e) => setDispModel(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-slate-300 mb-1">Serial Number</label>
                  <input
                    type="text"
                    value={dispSerial}
                    onChange={(e) => setDispSerial(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-300 mb-1">Commissioned Date</label>
                  <input
                    type="date"
                    value={dispCommissionedAt}
                    onChange={(e) => setDispCommissionedAt(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs text-slate-300 mb-1">DU Operational Status</label>
                <select
                  value={dispStatus}
                  onChange={(e) => setDispStatus(e.target.value as any)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                >
                  <option value="ACTIVE">ACTIVE</option>
                  <option value="INACTIVE">INACTIVE</option>
                  <option value="MAINTENANCE">MAINTENANCE</option>
                  <option value="DECOMMISSIONED">DECOMMISSIONED</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
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
                          ? 'bg-orange-500/20 border-orange-500 text-orange-400 shadow-sm shadow-orange-500/20'
                          : 'bg-slate-800/80 border-slate-700 text-slate-400 hover:text-white'
                      }`}
                    >
                      {getDuTypeLabel(cap)}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3">
                <button type="button" onClick={() => setModalType(null)} className="px-4 py-2 bg-slate-800 rounded-xl text-xs text-slate-300">Cancel</button>
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
          <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm" onClick={() => setModalType(null)} />
          <div className="relative z-10 w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl">
            <h2 className="text-lg font-bold text-white mb-2">Configure Dispensing Unit (DU #{editingDispenser.dispenserNumber})</h2>
            {modalError && <div className="p-3 mb-3 bg-rose-500/10 text-rose-400 text-xs rounded-xl">{modalError}</div>}
            <form onSubmit={handleEditDispenser} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-slate-400 mb-1">DU Number (Read Only)</label>
                  <div className="w-full bg-slate-800/60 border border-slate-800 rounded-xl px-3 py-2 text-xs font-bold font-mono text-orange-400">
                    DU #{editingDispenser.dispenserNumber}
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-slate-300 mb-1">DU Name</label>
                  <input
                    type="text"
                    value={dispName}
                    onChange={(e) => setDispName(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-slate-300 mb-1">Manufacturer</label>
                  <input
                    type="text"
                    value={dispManufacturer}
                    onChange={(e) => setDispManufacturer(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-300 mb-1">Model</label>
                  <input
                    type="text"
                    value={dispModel}
                    onChange={(e) => setDispModel(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-slate-300 mb-1">Serial Number</label>
                  <input
                    type="text"
                    value={dispSerial}
                    onChange={(e) => setDispSerial(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-300 mb-1">Commissioned Date</label>
                  <input
                    type="date"
                    value={dispCommissionedAt}
                    onChange={(e) => setDispCommissionedAt(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs text-slate-300 mb-1">DU Operational Status</label>
                <select
                  value={dispStatus}
                  onChange={(e) => setDispStatus(e.target.value as any)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                >
                  <option value="ACTIVE">ACTIVE</option>
                  <option value="INACTIVE">INACTIVE</option>
                  <option value="MAINTENANCE">MAINTENANCE</option>
                  <option value="DECOMMISSIONED">DECOMMISSIONED</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1">
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
                          ? 'bg-orange-500/20 border-orange-500 text-orange-400 shadow-sm shadow-orange-500/20'
                          : 'bg-slate-800/80 border-slate-700 text-slate-400 hover:text-white'
                      }`}
                    >
                      {getDuTypeLabel(cap)}
                    </button>
                  ))}
                </div>
                <p className="text-[10px] text-slate-500 mt-1">
                  Cannot be reduced below existing configured nozzle positions on this unit.
                </p>
              </div>

              <div className="flex justify-end gap-2 pt-3">
                <button type="button" onClick={() => setModalType(null)} className="px-4 py-2 bg-slate-800 rounded-xl text-xs text-slate-300">Cancel</button>
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
            <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm" onClick={() => setModalType(null)} />
            <div className="relative z-10 w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl space-y-4">
              <h2 className="text-lg font-bold text-white">Configure Fuel Nozzle</h2>
              {modalError && <div className="p-3 bg-rose-500/10 text-rose-400 text-xs rounded-xl">{modalError}</div>}

              <form onSubmit={handleAddNozzle} className="space-y-3">
                {/* 1. Select DU */}
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    1. Select Dispensing Unit (DU)
                  </label>
                  <select
                    value={resolved.dispenserId}
                    onChange={(e) => handleNozzleDispenserChange(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white font-medium"
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
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    2. Select Available Nozzle Position
                  </label>
                  {isNoPositionsAvailable ? (
                    <div className="p-3 bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs rounded-xl font-medium">
                      All nozzle positions on this DU ({selectedDu?.nozzleCapacity || 6}) are already configured.
                    </div>
                  ) : (
                    <select
                      value={resolved.nozzleNumber}
                      onChange={(e) => {
                        setNozzleNumber(Number(e.target.value));
                        setModalError(null);
                      }}
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white font-bold font-mono"
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
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    3. Select Fuel Product (Active Liquid Grades)
                  </label>
                  <select
                    value={resolved.productId}
                    onChange={(e) => handleNozzleProductChange(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white font-medium"
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
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    4. Select Connected Underground Tank
                  </label>
                  {matchingTanks.length === 0 ? (
                    <div className="p-3 bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs rounded-xl font-medium">
                      No active underground tanks configured for this product grade. Please create an underground tank first.
                    </div>
                  ) : (
                    <select
                      value={resolved.tankId}
                      onChange={(e) => {
                        setNozzleTankId(e.target.value);
                        setModalError(null);
                      }}
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white font-medium"
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
                  <button type="button" onClick={() => setModalType(null)} className="px-4 py-2 bg-slate-800 rounded-xl text-xs text-slate-300">Cancel</button>
                  <button
                    type="submit"
                    disabled={modalSubmitting || isNoPositionsAvailable || matchingTanks.length === 0}
                    className="px-4 py-2 bg-orange-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl text-xs font-bold shadow-md shadow-orange-500/20"
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
          <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm" onClick={() => setModalType(null)} />
          <div className="relative z-10 w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl">
            <h2 className="text-lg font-bold text-white mb-2">Create Shift Template</h2>
            {modalError && <div className="p-3 mb-3 bg-rose-500/10 text-rose-400 text-xs rounded-xl">{modalError}</div>}
            <form onSubmit={handleAddShift} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-slate-300 mb-1">Shift Code</label>
                  <input
                    type="text"
                    value={shiftCode}
                    onChange={(e) => setShiftCode(e.target.value.toUpperCase())}
                    placeholder="e.g. SHIFT_1"
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-300 mb-1">Sequence</label>
                  <input
                    type="number"
                    value={shiftSeq}
                    onChange={(e) => setShiftSeq(Number(e.target.value))}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white font-mono"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs text-slate-300 mb-1">Name</label>
                <input
                  type="text"
                  value={shiftName}
                  onChange={(e) => setShiftName(e.target.value)}
                  placeholder="e.g. Morning Shift"
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-slate-300 mb-1">Start Time (24h)</label>
                  <input
                    type="text"
                    value={shiftStart}
                    onChange={(e) => setShiftStart(e.target.value)}
                    placeholder="06:00"
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-300 mb-1">End Time (24h)</label>
                  <input
                    type="text"
                    value={shiftEnd}
                    onChange={(e) => setShiftEnd(e.target.value)}
                    placeholder="14:00"
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white font-mono"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-3">
                <button type="button" onClick={() => setModalType(null)} className="px-4 py-2 bg-slate-800 rounded-xl text-xs text-slate-300">Cancel</button>
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
          <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm" onClick={() => setModalType(null)} />
          <div className="relative z-10 w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-white">Edit Shift Template ({editingShift.code})</h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Update central shift timing, sequence, and operational status
                </p>
              </div>
              <button
                type="button"
                onClick={() => setModalType(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {modalError && (
              <div className="p-3 bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs rounded-xl flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{modalError}</span>
              </div>
            )}

            <form onSubmit={handleEditShift} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Shift Code (Immutable)</label>
                  <div className="w-full bg-slate-800/60 border border-slate-800 rounded-xl px-3 py-2 text-xs font-bold font-mono text-orange-400">
                    {editingShift.code}
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-slate-300 mb-1">Sequence</label>
                  <input
                    type="number"
                    value={editShiftSeq}
                    onChange={(e) => setEditShiftSeq(Number(e.target.value))}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs text-slate-300 mb-1">Shift Name</label>
                <input
                  type="text"
                  value={editShiftName}
                  onChange={(e) => setEditShiftName(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-slate-300 mb-1">Start Time (24h)</label>
                  <input
                    type="text"
                    value={editShiftStart}
                    onChange={(e) => setEditShiftStart(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs text-slate-300 mb-1">End Time (24h)</label>
                  <input
                    type="text"
                    value={editShiftEnd}
                    onChange={(e) => setEditShiftEnd(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs text-slate-300 mb-1">Operational Status</label>
                <select
                  value={editShiftStatus}
                  onChange={(e) => setEditShiftStatus(e.target.value as any)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                >
                  <option value="ACTIVE">ACTIVE</option>
                  <option value="INACTIVE">INACTIVE</option>
                </select>
              </div>

              <div className="p-2.5 bg-slate-950/60 border border-slate-800 rounded-xl text-[11px] text-slate-400">
                ℹ️ Notice: Inactivating a shift template prevents it from being used for new operational shifts or roster schedules, while all historical shifts remain completely intact.
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setModalType(null)}
                  className="px-4 py-2 bg-slate-800 rounded-xl text-xs text-slate-300"
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
          <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm" onClick={() => setModalType(null)} />
          <div className="relative z-10 w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-bold text-white">Edit Tank #{editingTank.tankNumber}</h2>
                <p className="text-xs text-slate-400 mt-0.5">
                  Update tank specifications and operational lifecycle status
                </p>
              </div>
              <button
                type="button"
                onClick={() => setModalType(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {modalError && (
              <div className="p-3 bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs rounded-xl flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{modalError}</span>
              </div>
            )}

            <form onSubmit={handleEditTank} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs text-slate-400 mb-1">Tank Number (Read Only)</label>
                  <div className="w-full bg-slate-800/60 border border-slate-800 rounded-xl px-3 py-2 text-xs font-bold font-mono text-orange-400">
                    Tank #{editingTank.tankNumber}
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-slate-300 mb-1">Fuel Grade</label>
                  <select
                    value={editTankProductId}
                    onChange={(e) => setEditTankProductId(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
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
                <label className="block text-xs text-slate-300 mb-1">Tank Name</label>
                <input
                  type="text"
                  value={editTankName}
                  onChange={(e) => setEditTankName(e.target.value)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                />
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="block text-[10px] text-slate-400 mb-1">Total Cap (L)</label>
                  <input
                    type="number"
                    value={editTankCapacity}
                    onChange={(e) => setEditTankCapacity(Number(e.target.value))}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-2 py-1.5 text-xs text-white"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-slate-400 mb-1">Safe Fill (L)</label>
                  <input
                    type="number"
                    value={editTankSafeFill}
                    onChange={(e) => setEditTankSafeFill(Number(e.target.value))}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-2 py-1.5 text-xs text-white"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-slate-400 mb-1">Min Level (L)</label>
                  <input
                    type="number"
                    value={editTankMinOperating}
                    onChange={(e) => setEditTankMinOperating(Number(e.target.value))}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-2 py-1.5 text-xs text-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs text-slate-300 mb-1">Tank Operational Status</label>
                <select
                  value={editTankStatus}
                  onChange={(e) => setEditTankStatus(e.target.value as any)}
                  className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white"
                >
                  <option value="ACTIVE">ACTIVE</option>
                  <option value="INACTIVE">INACTIVE</option>
                  <option value="MAINTENANCE">MAINTENANCE</option>
                  <option value="DECOMMISSIONED">DECOMMISSIONED</option>
                </select>
              </div>

              <div className="p-2.5 bg-slate-950/60 border border-slate-800 rounded-xl text-[11px] text-slate-400">
                ℹ️ Notice: Changing fuel grade product on an operational tank will be safely rejected if connected nozzles, historical meter readings, or fuel receipts are recorded.
              </div>

              <div className="flex justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setModalType(null)}
                  className="px-4 py-2 bg-slate-800 rounded-xl text-xs text-slate-300"
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
            <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm" onClick={() => setModalType(null)} />
            <div className="relative z-10 w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl p-6 shadow-2xl space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-lg font-bold text-white">Edit Nozzle Mapping</h2>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Correct retail outlet infrastructure configuration for future operational shifts
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setModalType(null)}
                  className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {modalError && (
                <div className="p-3 bg-rose-500/10 border border-rose-500/30 text-rose-400 text-xs rounded-xl flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{modalError}</span>
                </div>
              )}

              <form onSubmit={handleEditNozzle} className="space-y-4">
                {/* 1. Dispensing Unit (Immutable) */}
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">
                    Dispensing Unit (DU / MPD)
                  </label>
                  <div className="w-full bg-slate-800/60 border border-slate-800 rounded-xl px-3 py-2 text-xs font-mono font-bold text-slate-200">
                    MPD #{editingNozzle.dispenserNumber} ({editingNozzle.dispenserName || `DU #${editingNozzle.dispenserNumber}`})
                  </div>
                  <span className="text-[10px] text-slate-500 mt-1 block">Dispenser unit assignment is immutable in this phase</span>
                </div>

                {/* 2. Nozzle Position (Immutable) */}
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">
                    Nozzle Number / Position
                  </label>
                  <div className="w-full bg-slate-800/60 border border-slate-800 rounded-xl px-3 py-2 text-xs font-mono font-bold text-orange-400">
                    Position #{editingNozzle.nozzleNumber}
                  </div>
                </div>

                {/* 3. Fuel Product Dropdown */}
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Fuel Product (Active Liquid Grades)
                  </label>
                  <select
                    value={editNozzleProductId}
                    onChange={(e) => handleEditNozzleProductChange(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white font-medium focus:outline-none focus:border-orange-500"
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
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Connected Underground Tank (Active)
                  </label>
                  {matchingTanks.length === 0 ? (
                    <div className="p-3 bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs rounded-xl font-medium">
                      No active tanks found for this fuel product grade.
                    </div>
                  ) : (
                    <select
                      value={editNozzleTankId}
                      onChange={(e) => handleEditNozzleTankChange(e.target.value)}
                      className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white font-medium focus:outline-none focus:border-orange-500"
                    >
                      {matchingTanks.map(t => (
                        <option key={t.id} value={t.id}>
                          Tank #{t.tankNumber} — {t.name} ({t.capacityLitres.toLocaleString()} L)
                        </option>
                      ))}
                    </select>
                  )}
                  {isMismatched && (
                    <span className="text-[10px] text-amber-400 mt-1 block">
                      ⚠️ Please select a valid tank matching the selected fuel product.
                    </span>
                  )}
                </div>

                {/* 5. Operational Status */}
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Lifecycle Status
                  </label>
                  <select
                    value={editNozzleStatus}
                    onChange={(e) => setEditNozzleStatus(e.target.value as any)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-white font-medium focus:outline-none focus:border-orange-500"
                  >
                    <option value="ACTIVE">ACTIVE</option>
                    <option value="INACTIVE">INACTIVE</option>
                    <option value="MAINTENANCE">MAINTENANCE</option>
                    <option value="DECOMMISSIONED">DECOMMISSIONED</option>
                  </select>
                </div>

                {/* Notice regarding historical safety */}
                <div className="p-2.5 bg-slate-950/60 border border-slate-800 rounded-xl text-[11px] text-slate-400">
                  ℹ️ Changes to this nozzle mapping take effect immediately for future shifts. Historical shift snapshots and closed meter readings remain safely unchanged.
                </div>

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setModalType(null)}
                    className="px-4 py-2 bg-slate-800 hover:bg-slate-700 rounded-xl text-xs text-slate-300 font-semibold transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={modalSubmitting || matchingTanks.length === 0 || isMismatched}
                    className="px-4 py-2 bg-gradient-to-r from-orange-500 to-amber-600 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl text-xs font-bold shadow-md shadow-orange-500/20 transition-all"
                  >
                    {modalSubmitting ? 'Saving...' : 'Save Mapping'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        );
      })()}
    </div>
  );
};
