import test from 'node:test';
import assert from 'node:assert/strict';
import { buildClinicGroups, filterByWorkspace, normalizeWorkspaceSelection } from './clinic-workspace.js';

const businesses = [
  { id: 'main', name: 'Elixir Clinic', active: true },
  { id: 'spa', name: 'Elixir Clinic Spa', active: true },
  { id: 'florezen', name: 'Florezen', active: true },
  { id: 'inactive', name: 'Archivado', active: false },
];
const branches = [
  { id: 'main', name: 'Elixir Clinic', businessId: 'main', active: true },
  { id: 'macristy-spa', name: 'Macristy - Elixir Clinic Spa', businessId: 'spa', active: true },
  { id: 'zaragoza-spa', name: 'Zaragoza - Elixir Clinic Spa', businessId: 'spa', active: true },
  { id: 'macristy-florezen', name: 'Macristy - Florezen', businessId: 'florezen', active: true },
  { id: 'zaragoza-florezen', name: 'Zaragoza - Florezen', businessId: 'florezen', active: true },
  { id: 'closed', name: 'Sucursal cerrada', businessId: 'spa', active: false },
];

test('groups the two clinics with their active areas', () => {
  assert.deepEqual(buildClinicGroups(businesses, branches).map(group => ({
    name: group.name,
    branches: group.branches.map(branch => branch.id),
  })), [
    { name: 'Elixir Clinic Spa', branches: ['macristy-spa', 'zaragoza-spa'] },
    { name: 'Florezen', branches: ['macristy-florezen', 'zaragoza-florezen'] },
  ]);
});

test('normalizes stale clinic and area selections safely', () => {
  assert.deepEqual(normalizeWorkspaceSelection({ businessId: 'spa', branchId: 'zaragoza-spa' }, businesses, branches), {
    businessId: 'spa', branchId: 'zaragoza-spa',
  });
  assert.deepEqual(normalizeWorkspaceSelection({ businessId: 'spa', branchId: 'zaragoza-florezen' }, businesses, branches), {
    businessId: 'spa', branchId: '',
  });
  assert.deepEqual(normalizeWorkspaceSelection({ businessId: 'missing', branchId: '' }, businesses, branches), {
    businessId: '', branchId: '',
  });
});

test('filters records to a clinic or one of its areas, resolving legacy branch names', () => {
  const records = [
    { id: 'spa-explicit', businessId: 'spa', branchId: 'macristy-spa' },
    { id: 'spa-name', branch: 'Zaragoza - Elixir Clinic Spa' },
    { id: 'spa-reminder', branchName: 'Macristy - Elixir Clinic Spa' },
    { id: 'florezen', branchId: 'macristy-florezen' },
    { id: 'unassigned' },
  ];

  assert.deepEqual(filterByWorkspace(records, { businessId: 'spa', branchId: '' }, branches).map(item => item.id), ['spa-explicit', 'spa-name', 'spa-reminder']);
  assert.deepEqual(filterByWorkspace(records, { businessId: 'spa', branchId: 'zaragoza-spa' }, branches).map(item => item.id), ['spa-name']);
  assert.deepEqual(filterByWorkspace(branches, { businessId: 'spa', branchId: 'zaragoza-spa' }, branches).map(item => item.id), ['zaragoza-spa']);
  assert.equal(filterByWorkspace(records, { businessId: '', branchId: '' }, branches), records);

  const providers = [
    { id: 'spa-team', branchIds: ['macristy-spa', 'zaragoza-spa'] },
    { id: 'florezen-team', branchIds: ['macristy-florezen'] },
  ];
  assert.deepEqual(filterByWorkspace(providers, { businessId: 'spa', branchId: '' }, branches).map(item => item.id), ['spa-team']);
  assert.deepEqual(filterByWorkspace(providers, { businessId: 'spa', branchId: 'zaragoza-spa' }, branches).map(item => item.id), ['spa-team']);
  assert.deepEqual(filterByWorkspace([{ id: 'unassigned-provider', branchIds: [] }], { businessId: 'florezen', branchId: 'zaragoza-florezen' }, branches).map(item => item.id), ['unassigned-provider']);
});
