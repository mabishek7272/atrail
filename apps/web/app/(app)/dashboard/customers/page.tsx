'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { authedFetch } from '@/lib/authed-fetch';
import { AlertCircle, Plus, Search, X } from 'lucide-react';

const COUNTRIES = [
  { name: 'India', code: 'IN', phoneCode: '+91', tax1Label: 'GST Number', tax1Placeholder: '27AAPFU0939F1ZV', tax2Label: 'PAN Number', tax2Placeholder: 'AAPFU0939F' },
  { name: 'United States', code: 'US', phoneCode: '+1', tax1Label: 'EIN / Tax ID', tax1Placeholder: '12-3456789', tax2Label: 'State Tax ID / SSN', tax2Placeholder: '123-45-6789' },
  { name: 'United Kingdom', code: 'GB', phoneCode: '+44', tax1Label: 'VAT Number', tax1Placeholder: 'GB123456789', tax2Label: 'Company Registration Number (CRN)', tax2Placeholder: '12345678' },
  { name: 'Australia', code: 'AU', phoneCode: '+61', tax1Label: 'Australian Business Number (ABN)', tax1Placeholder: '51 824 753 556', tax2Label: 'Australian Company Number (ACN)', tax2Placeholder: '123 456 789' },
  { name: 'Singapore', code: 'SG', phoneCode: '+65', tax1Label: 'Unique Entity Number (UEN)', tax1Placeholder: '201234567N', tax2Label: 'GST Registration Number', tax2Placeholder: 'M90123456X' },
  { name: 'Japan', code: 'JP', phoneCode: '+81', tax1Label: 'Corporate Number', tax1Placeholder: '1234567890123', tax2Label: 'Individual Number / My Number', tax2Placeholder: '123456789012' },
  { name: 'Malaysia', code: 'MY', phoneCode: '+60', tax1Label: 'SST ID', tax1Placeholder: 'W10-1808-32000030', tax2Label: 'Company Registration Number (BRN)', tax2Placeholder: '202001012345' },
  { name: 'Thailand', code: 'TH', phoneCode: '+66', tax1Label: 'Tax Identification Number (TIN)', tax1Placeholder: '0105556000123', tax2Label: 'VAT ID', tax2Placeholder: '13-digit number' },
  { name: 'Vietnam', code: 'VN', phoneCode: '+84', tax1Label: 'Enterprise Identification Number (MSDN)', tax1Placeholder: '0102030405', tax2Label: 'Tax Code (Mã số thuế)', tax2Placeholder: '0102030405' },
  { name: 'Indonesia', code: 'ID', phoneCode: '+62', tax1Label: 'NPWP (Taxpayer Number)', tax1Placeholder: '01.234.567.8-901.000', tax2Label: 'NIB (Single Business Number)', tax2Placeholder: '13-digit number' },
  { name: 'Philippines', code: 'PH', phoneCode: '+63', tax1Label: 'Tax Identification Number (TIN)', tax1Placeholder: '123-456-789-000', tax2Label: 'SEC Registration Number', tax2Placeholder: 'CS201012345' },
];

const getCountryConfig = (countryName: string) => {
  const found = COUNTRIES.find(c => c.name.toLowerCase() === countryName?.toLowerCase());
  if (found) return found;
  return {
    name: countryName || 'Other',
    code: 'OTHER',
    phoneCode: '+',
    tax1Label: 'Business Registry No (BRN)',
    tax1Placeholder: 'e.g. BRN123456',
    tax2Label: 'Tax Identification No (TIN)',
    tax2Placeholder: 'e.g. TIN123456',
  };
};

interface Customer {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  city?: string;
  country?: string;
  healthScore: number;
  churnRisk: string;
  contacts: { id: string }[];
  renewals: { id: string }[];
}

const HEALTH_COLOR = (s: number) =>
  s >= 75 ? 'bg-green-900/40 text-green-400' : s >= 50 ? 'bg-yellow-900/40 text-yellow-400' : 'bg-red-900/40 text-red-400';

const RISK_COLOR: Record<string, string> = {
  LOW:      'bg-green-900/40 text-green-400',
  MEDIUM:   'bg-yellow-900/40 text-yellow-400',
  HIGH:     'bg-orange-900/40 text-orange-400',
  CRITICAL: 'bg-red-900/40 text-red-400',
};

const EMPTY_FORM = { name: '', email: '', phone: '', address: '', city: '', country: 'India', gstNumber: '', panNumber: '' };

export default function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading]     = useState(true);
  const [search, setSearch]       = useState('');
  const [showForm, setShowForm]   = useState(false);
  const [form, setForm]           = useState(EMPTY_FORM);
  const [saving, setSaving]       = useState(false);
  const [error, setError]         = useState('');

  const countryConfig = getCountryConfig(form.country);
  const predefinedCountries = COUNTRIES.map(c => c.name);

  const load = () =>
    authedFetch<{ ok: boolean; data: Customer[] }>('/customers')
      .then(r => { if (r.ok) setCustomers(r.data); })
      .catch(console.error)
      .finally(() => setLoading(false));

  useEffect(() => { load(); }, []);

  const filtered = customers.filter(c => {
    if (!search) return true;
    const q = search.toLowerCase();
    return c.name.toLowerCase().includes(q) || c.email?.toLowerCase().includes(q) || c.city?.toLowerCase().includes(q);
  });

  const createCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!form.name.trim()) { setError('Customer name is required.'); return; }
    setSaving(true);
    try {
      const r = await authedFetch<{ ok: boolean; data: Customer }>('/customers', {
        method: 'POST',
        body: JSON.stringify(form),
      });
      if (r.ok) {
        setCustomers(prev => [r.data, ...prev]);
        setForm(EMPTY_FORM);
        setShowForm(false);
      } else {
        setError('Failed to create customer.');
      }
    } catch {
      setError('Failed to create customer.');
    } finally {
      setSaving(false);
    }
  };

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  return (
    <div className="min-h-screen bg-transparent p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-3xl font-bold text-white">Customers</h1>
            <p className="text-gray-400 text-sm mt-1">Manage customer 360° views and relationships</p>
          </div>
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg transition-colors text-sm"
          >
            <Plus className="w-4 h-4" /> Add Customer
          </button>
        </div>

        {/* Search */}
        <div className="relative mb-5">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input
            type="text"
            placeholder="Search customers..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-9 pr-4 py-2.5 bg-[rgba(6,22,40,0.7)] border border-white/10 rounded-lg text-white text-sm placeholder-gray-500 focus:outline-none focus:border-blue-500"
          />
        </div>

        {/* Table */}
        <div className="bg-[rgba(6,22,40,0.7)] backdrop-blur-lg border border-[rgba(0,212,255,0.1)] rounded-xl overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center py-16">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500" />
            </div>
          ) : (
            <table className="w-full">
              <thead className="bg-[rgba(6,22,40,0.4)] border-b border-[rgba(0,212,255,0.08)]">
                <tr>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wide">Customer</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wide">Contact</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wide">Health</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wide">Churn Risk</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wide">Renewals</th>
                  <th className="px-5 py-3 text-left text-xs font-semibold text-gray-400 uppercase tracking-wide">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {filtered.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-5 py-16 text-center">
                      <AlertCircle className="h-8 w-8 text-gray-500 mx-auto mb-2" />
                      <p className="text-gray-400">{search ? 'No customers match your search' : 'No customers yet'}</p>
                      {!search && (
                        <button onClick={() => setShowForm(true)} className="mt-3 text-blue-400 text-sm hover:underline">
                          Add your first customer
                        </button>
                      )}
                    </td>
                  </tr>
                ) : (
                  filtered.map(c => (
                    <tr key={c.id} className="hover:bg-white/5 transition-colors">
                      <td className="px-5 py-4">
                        <div className="font-medium text-white">{c.name}</div>
                        {(c.city || c.country) && (
                          <div className="text-xs text-gray-500 mt-0.5">{[c.city, c.country].filter(Boolean).join(', ')}</div>
                        )}
                      </td>
                      <td className="px-5 py-4">
                        {c.email && <div className="text-sm text-gray-300">{c.email}</div>}
                        {c.phone && <div className="text-xs text-gray-500">{c.phone}</div>}
                        {!c.email && !c.phone && <span className="text-gray-600 text-sm">—</span>}
                      </td>
                      <td className="px-5 py-4">
                        <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${HEALTH_COLOR(c.healthScore)}`}>
                          {c.healthScore}
                        </span>
                      </td>
                      <td className="px-5 py-4">
                        <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${RISK_COLOR[c.churnRisk] || RISK_COLOR.LOW}`}>
                          {c.churnRisk}
                        </span>
                      </td>
                      <td className="px-5 py-4">
                        <div className="text-white font-semibold">{c.renewals?.length ?? 0}</div>
                        <div className="text-xs text-gray-500">{c.contacts?.length ?? 0} contacts</div>
                      </td>
                      <td className="px-5 py-4">
                        <Link href={`/dashboard/customers/${c.id}`} className="text-blue-400 hover:text-blue-300 text-sm font-medium hover:underline">
                          View 360°
                        </Link>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Add Customer Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-[rgba(6,22,40,0.95)] border border-[rgba(0,212,255,0.15)] rounded-xl p-6 w-full max-w-lg shadow-2xl">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-white text-xl font-bold">Add Customer</h2>
              <button onClick={() => { setShowForm(false); setError(''); }} className="p-1.5 rounded-lg text-gray-400 hover:text-white hover:bg-white/5 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            {error && <p className="text-red-400 text-sm bg-red-900/20 border border-red-800/40 rounded-lg px-4 py-2 mb-4">{error}</p>}

            <form onSubmit={createCustomer} className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  <label className="block text-gray-400 text-xs uppercase tracking-wide mb-1">Company Name *</label>
                  <input type="text" value={form.name} onChange={e => set('name', e.target.value)} required placeholder="e.g. Acme Corp" className={IN} />
                </div>
                <div>
                  <label className="block text-gray-400 text-xs uppercase tracking-wide mb-1">Email</label>
                  <input type="email" value={form.email} onChange={e => set('email', e.target.value)} placeholder="contact@company.com" className={IN} />
                </div>
                <div>
                  <label className="block text-gray-400 text-xs uppercase tracking-wide mb-1">Phone</label>
                  <input type="text" value={form.phone} onChange={e => set('phone', e.target.value)} placeholder={countryConfig.phoneCode + " 98765 43210"} className={IN} />
                </div>
                <div className="col-span-2">
                  <label className="block text-gray-400 text-xs uppercase tracking-wide mb-1">Address</label>
                  <input type="text" value={form.address} onChange={e => set('address', e.target.value)} placeholder="Street address" className={IN} />
                </div>
                <div>
                  <label className="block text-gray-400 text-xs uppercase tracking-wide mb-1">City</label>
                  <input type="text" value={form.city} onChange={e => set('city', e.target.value)} placeholder="Mumbai" className={IN} />
                </div>
                <div>
                  <label className="block text-gray-400 text-xs uppercase tracking-wide mb-1">Country</label>
                  <select
                    value={predefinedCountries.includes(form.country) ? form.country : (form.country ? 'Others...' : '')}
                    onChange={e => {
                      const val = e.target.value;
                      if (val === 'Others...') {
                        set('country', '');
                      } else {
                        set('country', val);
                        const config = COUNTRIES.find(c => c.name === val);
                        if (config && (!form.phone || form.phone.trim() === '' || COUNTRIES.some(c => form.phone.startsWith(c.phoneCode)))) {
                          set('phone', config.phoneCode + ' ');
                        }
                      }
                    }}
                    className={SEL}
                  >
                    <option value="" disabled>Select Country</option>
                    {COUNTRIES.map(c => (
                      <option key={c.name} value={c.name} className="bg-[#061628] text-white">{c.name}</option>
                    ))}
                    <option value="Others..." className="bg-[#061628] text-white">Others...</option>
                  </select>
                  {(!predefinedCountries.includes(form.country) || form.country === '') && (
                    <div className="mt-2">
                      <input
                        type="text"
                        value={form.country}
                        onChange={e => set('country', e.target.value)}
                        placeholder="Enter Country Name"
                        className={IN}
                        required
                      />
                    </div>
                  )}
                </div>
                <div>
                  <label className="block text-gray-400 text-xs uppercase tracking-wide mb-1">{countryConfig.tax1Label}</label>
                  <input type="text" value={form.gstNumber} onChange={e => set('gstNumber', e.target.value)} placeholder={countryConfig.tax1Placeholder} className={IN} />
                </div>
                <div>
                  <label className="block text-gray-400 text-xs uppercase tracking-wide mb-1">{countryConfig.tax2Label}</label>
                  <input type="text" value={form.panNumber} onChange={e => set('panNumber', e.target.value)} placeholder={countryConfig.tax2Placeholder} className={IN} />
                </div>
              </div>
              <div className="flex gap-3 pt-2">
                <button type="button" onClick={() => { setShowForm(false); setError(''); }} className="flex-1 py-2.5 border border-white/10 text-gray-400 hover:bg-white/5 rounded-lg text-sm transition-colors">
                  Cancel
                </button>
                <button type="submit" disabled={saving} className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg text-sm transition-colors disabled:opacity-50">
                  {saving ? 'Creating...' : 'Create Customer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

const IN = 'w-full px-3 py-2 bg-white/5 border border-white/10 rounded-lg text-white text-sm placeholder-gray-500 focus:outline-none focus:border-blue-500';
const SEL = 'w-full px-3 py-2 bg-[rgba(6,22,40,0.9)] border border-white/10 rounded-lg text-gray-200 text-sm focus:outline-none focus:border-blue-500';
