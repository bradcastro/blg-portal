const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const blg = require('../blg-reports.js');

const HUB = 'BLG-90001';
const PP_A = 'BLG-90002';
const PP_B = 'BLG-90003';
const CHILD = 'BLG-90004';
const OTHER_HUB = 'BLG-90005';
const OTHER_PP = 'BLG-90006';
const METRIC = 'BLG-90007';

function leader(uid, role, reportsTo, extra) {
  return Object.assign({
    uid: uid,
    first: 'Leader',
    last: uid.slice(-2),
    role: role,
    reportsTo: reportsTo || '',
    email: uid.toLowerCase() + '@example.com',
    phone: '555-' + uid.slice(-4),
    referral: OTHER_HUB,
    localPartnerPastors: [OTHER_PP]
  }, extra || {});
}

function group(uid, leaderUid, extra) {
  return Object.assign({
    uid: uid,
    leaderUid: leaderUid,
    name: 'Group ' + uid.slice(-2),
    city: 'Fixture City',
    country: 'Fixture Land',
    active: 'YES',
    originalOwnerUid: HUB,
    phone: '555-0199'
  }, extra || {});
}

const leaders = [
  leader(HUB, 'Hub Pastor', HUB, { first: 'Hub', last: 'One' }),
  leader(PP_A, 'Partner Pastor', HUB, { first: 'Pastor', last: 'Alpha' }),
  leader(PP_B, 'Partner Pastor', HUB, { first: 'Pastor', last: 'Beta' }),
  leader(CHILD, 'Partner Pastor', PP_A, { first: 'Leader', last: 'Child' }),
  leader(OTHER_HUB, 'Hub Pastor', '', { first: 'Hub', last: 'Two' }),
  leader(OTHER_PP, 'Partner Pastor', OTHER_HUB, { first: 'Pastor', last: 'Other' }),
  leader(METRIC, 'Partner Pastor', '15', { first: 'Metric', last: 'Row' })
];

const groups = [
  group('BLG-91001', HUB, { name: 'Hub Own Group' }),
  group('BLG-91002', PP_A, { name: 'Alpha Group' }),
  group('BLG-91003', PP_B, { name: 'Beta Group' }),
  group('BLG-91004', CHILD, { name: 'Grandchild Group' }),
  group('BLG-91005', OTHER_PP, { name: 'Private Cedar Group' }),
  group('BLG-91006', OTHER_HUB, { name: 'Other Hub Group' }),
  group('BLG-91007', HUB, { name: 'Closed Group', active: false }),
  group('BLG-91008', PP_A, { name: 'Text False Group', active: 'false' }),
  group('BLG-91009', METRIC, { name: 'Metric Leader Group' }),
  group('BLG-91010', HUB, { name: 'Still Open', active: 'NO' })
];

const checkins = [
  { groupUID: 'BLG-91001', date: '2026-03-02', attendees: 4, week: '2026-W10', email: 'hidden@example.com' },
  { groupUID: 'BLG-91001', date: '2026-03-09', attendees: 6, week: '2026-W11' },
  { groupUID: 'BLG-91002', date: '2026-03-04', attendees: 8, week: '2026-W10' },
  { groupUID: 'BLG-91003', date: '2026-04-01', attendees: 3, week: '2026-W14' },
  { groupUID: 'BLG-91004', date: '2026-03-05', attendees: 11, week: '2026-W10' },
  { groupUID: 'BLG-91005', date: '2026-03-06', attendees: 9, week: '2026-W10', phone: '555-0100' },
  { groupUID: 'BLG-91006', date: '2026-03-06', attendees: 2, week: '2026-W10' },
  { groupUID: 'BLG-91001', date: '2025-12-31', attendees: 20, week: '2025-W53' },
  { groupUID: 'BLG-91009', date: '2026-03-08', attendees: 7, week: '2026-W10' }
];

function uids(list) {
  return Array.from(list, function (item) { return item.uid; }).sort();
}

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

test('hub pastor sees own groups and direct reports only', function () {
  const allowed = uids(blg.groupsAuthorizedForLeader(HUB, leaders, groups));
  assert.deepEqual(allowed, ['BLG-91001', 'BLG-91002', 'BLG-91003', 'BLG-91010']);
});

test('partner pastor sees only groups they currently lead', function () {
  assert.deepEqual(uids(blg.groupsAuthorizedForLeader(PP_A, leaders, groups)), ['BLG-91002']);
  assert.deepEqual(uids(blg.groupsAuthorizedForLeader(PP_B, leaders, groups)), ['BLG-91003']);
});

test('a partner pastor does not receive a grandchild network', function () {
  const report = blg.buildLeaderReport(PP_A, leaders, groups, checkins, '2026-01-01', '2026-12-31');
  assert.deepEqual(report.groupUids, ['BLG-91002']);
  assert.equal(report.rows.some(function (row) { return row.groupName === 'Grandchild Group'; }), false);
});

test('a hub does not inherit a partner pastor downline', function () {
  const report = blg.buildLeaderReport(HUB, leaders, groups, checkins, '2026-01-01', '2026-12-31');
  assert.equal(report.rows.some(function (row) { return row.groupUID === 'BLG-91004'; }), false);
  assert.equal(JSON.stringify(report).includes('Grandchild Group'), false);
});

test('leaders do not receive another hub network or private contact fields', function () {
  leaders.forEach(function (person) {
    const report = blg.buildLeaderReport(person.uid, leaders, groups, checkins, '2026-01-01', '2026-12-31');
    const allowed = new Set(blg.groupsAuthorizedForLeader(person.uid, leaders, groups).map(function (g) { return g.uid; }));
    assert.equal(report.recipientUid, person.uid);
    assert.equal(report.recipients, undefined);
    report.rows.forEach(function (row) {
      assert.equal(allowed.has(row.groupUID), true);
      assert.equal(row.email, undefined);
      assert.equal(row.phone, undefined);
    });
    const blob = JSON.stringify(report);
    leaders.forEach(function (other) {
      assert.equal(blob.includes(other.email), false);
      assert.equal(blob.includes(other.phone), false);
    });
    groups.forEach(function (item) {
      if (!allowed.has(item.uid)) assert.equal(blob.includes(item.name), false);
    });
  });
});

test('referral, original owner, local pastor list, and metric numbers are not relationships', function () {
  assert.equal(blg.supervisorUid(leader(METRIC, 'Partner Pastor', '15')), '');
  assert.equal(blg.groupsAuthorizedForLeader(HUB, leaders, groups).some(function (g) { return g.uid === 'BLG-91009'; }), false);
  assert.equal(blg.groupsAuthorizedForLeader(HUB, leaders, groups).some(function (g) { return g.uid === 'BLG-91005'; }), false);
  const transferred = group('BLG-91011', OTHER_PP, { originalOwnerUid: HUB, name: 'Transferred Away' });
  const withTransfer = groups.concat([transferred]);
  assert.equal(blg.groupsAuthorizedForLeader(HUB, leaders, withTransfer).some(function (g) { return g.uid === 'BLG-91011'; }), false);
  assert.equal(blg.groupsAuthorizedForLeader(OTHER_PP, leaders, withTransfer).some(function (g) { return g.uid === 'BLG-91011'; }), true);
});

test('role match is exact and self-reports do not duplicate groups', function () {
  const loose = leaders.map(function (person) { return person.uid === HUB ? Object.assign({}, person, { role: 'hub pastor' }) : person; });
  assert.deepEqual(uids(blg.groupsAuthorizedForLeader(HUB, loose, groups)), ['BLG-91001', 'BLG-91010']);
  const network = blg.presentNetwork(HUB, leaders, groups);
  assert.equal(network.subordinates.some(function (person) { return person.uid === HUB; }), false);
  assert.deepEqual(network.directGroups.map(function (g) { return g.uid; }).sort(), ['BLG-91001', 'BLG-91010']);
  assert.equal(JSON.stringify(network).includes('@example.com'), false);
});

test('active flag follows the deployed true/false test', function () {
  assert.equal(blg.isGroupActive('YES'), true);
  assert.equal(blg.isGroupActive(true), true);
  assert.equal(blg.isGroupActive(''), true);
  assert.equal(blg.isGroupActive('NO'), true);
  assert.equal(blg.isGroupActive(false), false);
  assert.equal(blg.isGroupActive('false'), false);
});

test('attendance instances are a sum, not a count of unique people', function () {
  const report = blg.buildLeaderReport(HUB, leaders, groups, checkins, '2026-03-01', '2026-03-31');
  const summary = blg.summarizeCheckins(report.rows);
  assert.equal(summary.meetings, 3);
  assert.equal(summary.groups, 2);
  assert.equal(summary.attendanceInstances, 4 + 6 + 8);
  assert.equal(report.rows.some(function (row) { return row.date === '2025-12-31'; }), false);
  assert.equal(report.rows.some(function (row) { return row.date === '2026-04-01'; }), false);
});

test('public check-in rows drop contact fields and escape rendered names', function () {
  const rows = blg.publicCheckinRows([{
    date: '2026-03-02', groupUID: 'BLG-91001', groupName: '<img src=x onerror=alert(1)>',
    leaderName: 'Ann', attendees: 4, email: 'secret@example.com', phone: '555-0100'
  }]);
  assert.equal(Object.hasOwn(rows[0], 'email'), false);
  assert.equal(JSON.stringify(rows).includes('secret@example.com'), false);
  const html = blg.renderCheckinReport(rows);
  assert.equal(html.includes('<img'), false);
  assert.equal(html.includes('&lt;img'), true);
  assert.equal(html.includes('Attendance instances'), true);
  assert.equal(html.includes('>10<') || html.includes('>4<'), true);
});

test('csv guards formula injection', function () {
  const csv = blg.toCsv([{ date: '2026-03-02', groupUID: 'BLG-91001', groupName: '=HYPERLINK("http://evil")', leaderName: 'Ann', attendees: 1, week: '2026-W10', leaderUID: 'BLG-90001' }]);
  assert.equal(csv.includes(',=HYPERLINK'), false);
  assert.equal(csv.includes("\"'=HYPERLINK(\"\"http://evil\"\")\""), true);
});

test('default report dates use the local calendar year', function () {
  const date = new Date(2026, 10, 7, 22, 30);
  assert.deepEqual(blg.defaultReportRange(date), { start: '2026-01-01', end: '2026-11-07' });
  assert.equal(blg.defaultReportRange(date).end, blg.localISODate(date));
  assert.equal(blg.cutoffDate(date, 4), '2026-10-10');
});

test('network payload for other hubs is refused', function () {
  const html = blg.renderNetworkReport({
    success: true,
    hubPastors: [{ uid: HUB, firstName: 'Secret', lastName: 'Hub', partnerPastors: [] }],
    unassigned: [{ uid: OTHER_PP, email: 'secret@example.com' }]
  }, { uid: HUB, first: 'Hub', last: 'One' });
  assert.equal(html.includes('Secret'), false);
  assert.equal(html.includes('secret@example.com'), false);
  assert.equal(html.includes('was not shown'), true);
});

test('scoped hierarchy keeps the supervisor identity and not their groups or email', function () {
  const data = {
    success: true,
    role: 'Partner Pastor',
    groups: [{ uid: 'BLG-91002', name: 'Alpha Group', checkinsThisWeek: 1 }],
    hubPastor: {
      uid: HUB,
      firstName: 'Hub',
      lastName: 'One',
      email: 'hub@example.com',
      groups: [{ uid: 'BLG-91005', name: 'Private Cedar Group' }]
    }
  };
  const html = blg.renderNetworkReport(data, { uid: PP_A, first: 'Pastor', last: 'Alpha' });
  assert.equal(html.includes('Alpha Group'), true);
  assert.equal(html.includes('Private Cedar Group'), false);
  assert.equal(html.includes('hub@example.com'), false);
  assert.equal(html.includes(HUB), true);
});

test('self-listed hub groups become their own groups, not a second pastor card', function () {
  const html = blg.renderNetworkReport({
    success: true,
    role: 'Hub Pastor',
    partnerPastors: [
      { uid: HUB, firstName: 'Hub', lastName: 'One', groups: [{ uid: 'BLG-91001', name: 'Hub Own Group' }] },
      { uid: PP_A, firstName: 'Pastor', lastName: 'Alpha', email: 'alpha@example.com', groups: [{ uid: 'BLG-91002', name: 'Alpha Group' }] }
    ]
  }, { uid: HUB, first: 'Hub', last: 'One' });
  assert.equal(html.includes('Alpha Group'), true);
  assert.equal(html.includes('alpha@example.com'), false);
  assert.equal(html.includes('Hub Own Group'), true);
  assert.equal((html.match(/Pastor Alpha/g) || []).length, 1);
});

test('check-ins add only the viewer\'s own missing groups', function () {
  const scope = blg.normalizeScopedHierarchy({ success: true, role: 'Hub Pastor', partnerPastors: [] }, { uid: HUB, first: 'Hub', last: 'One' });
  blg.addViewerGroupsFromCheckins(scope, [
    { groupUID: 'BLG-91001', groupName: 'Hub Own Group', leaderUID: HUB, date: '2026-03-02' },
    { groupUID: 'BLG-91005', groupName: 'Private Cedar Group', leaderUID: OTHER_PP, date: '2026-03-02', email: 'secret@example.com' }
  ], HUB);
  assert.deepEqual(scope.ownGroups.map(function (g) { return g.uid; }), ['BLG-91001']);
  assert.equal(JSON.stringify(scope).includes('Private Cedar Group'), false);
  assert.equal(JSON.stringify(scope).includes('secret@example.com'), false);
});

test('inactive groups stay inside the authorized scope', function () {
  const scope = blg.normalizeScopedHierarchy({
    success: true,
    role: 'Hub Pastor',
    directGroups: [{ uid: 'BLG-91001', name: 'Hub Own Group' }],
    partnerPastors: [{ uid: PP_A, firstName: 'Pastor', lastName: 'Alpha', groups: [{ uid: 'BLG-91002', name: 'Alpha Group' }] }]
  }, { uid: HUB, first: 'Hub', last: 'One' });
  const groupsInScope = blg.groupsFromScope(scope, { first: 'Hub', last: 'One' });
  const inactive = blg.inactiveGroupsInScope(groupsInScope, [
    { groupUID: 'BLG-91001', date: '2026-10-10' },
    { groupUID: 'BLG-91005', date: '2026-10-01', groupName: 'Private Cedar Group' }
  ], '2026-10-10');
  assert.deepEqual(inactive.map(function (g) { return g.uid; }), ['BLG-91002']);
  const html = blg.renderInactiveReport(inactive, '2026-10-10');
  assert.equal(html.includes('Private Cedar Group'), false);
  assert.equal(html.includes('Alpha Group'), true);
});

test('a failed check-in response is not treated as an empty report', function () {
  assert.equal(blg.checkinError({ success: false, rows: [], message: 'Leader not found' }), 'Leader not found');
  assert.equal(blg.checkinError({ success: true, rows: [] }), '');
  assert.equal(blg.checkinError({ rows: [] }), '');
});

test('leader headers put ReportsTo in the column after a combined Role header', function () {
  const headers = [
    'UID', 'First Name', 'Last Name', 'Email', 'Phone', 'Country', 'State / Province / Region', 'City',
    'Referral Leader UID', 'Registered Date', 'Total Groups Count', 'Network Size',
    'Role\tReportsTo UID', '2026-02 People Reached'
  ];
  const cols = blg.resolveLeaderColumns(headers);
  assert.equal(cols.uid, 0);
  assert.equal(cols.role, 12);
  assert.equal(cols.reportsTo, 13);
  assert.notEqual(cols.uid, 8);
  const split = headers.slice();
  split[12] = 'Role';
  split[13] = 'ReportsTo UID';
  assert.equal(blg.resolveLeaderColumns(split).reportsTo, 13);
  assert.deepEqual(blg.resolveGroupColumns([
    'Group UID', 'Current Leader UID', 'Group Name', 'Country', 'State / Province / Region', 'City', 'Created Date', 'Active', 'Original Owner UID'
  ]), { uid: 0, leader: 1, name: 2, country: 3, state: 4, city: 5, created: 6, active: 7, originalOwner: 8 });
  assert.deepEqual(blg.resolveCheckinColumns(['Group UID', 'Attendee Count', 'Meeting Date', 'Week', 'Submitted At']), {
    groupUid: 0, attendees: 1, meetingDate: 2, week: 3, submittedAt: 4
  });
});

test('apps script scope matches the portal scope on the same fixture', function () {
  const context = {
    console: console,
    SpreadsheetApp: {},
    Utilities: {},
    Session: { getScriptTimeZone: function () { return 'UTC'; } }
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'apps-script-additions.js'), 'utf8'), context, { filename: 'apps-script-additions.js' });
  assert.equal(typeof context.groupsAuthorizedForLeader_, 'function');
  [HUB, PP_A, PP_B, CHILD, OTHER_HUB, OTHER_PP, METRIC].forEach(function (uid) {
    assert.deepEqual(
      uids(context.groupsAuthorizedForLeader_(uid, leaders, groups)),
      uids(blg.groupsAuthorizedForLeader(uid, leaders, groups))
    );
    const scriptNetwork = plain(context.presentNetwork_(uid, leaders, groups));
    const portalNetwork = plain(blg.presentNetwork(uid, leaders, groups));
    assert.deepEqual(uids(scriptNetwork.directGroups), uids(portalNetwork.directGroups));
    assert.deepEqual(scriptNetwork.subordinates.map(function (p) { return p.uid; }), portalNetwork.subordinates.map(function (p) { return p.uid; }));
    assert.equal(JSON.stringify(scriptNetwork).includes('@example.com'), false);
  });

  const headers = [
    'UID', 'First Name', 'Last Name', 'Email', 'Phone', 'Country', 'State / Province / Region', 'City',
    'Referral Leader UID', 'Registered Date', 'Total Groups Count', 'Network Size',
    'Role\tReportsTo UID', '2026-02 People Reached'
  ];
  assert.deepEqual(plain(context.resolveLeaderColumns_(headers)), blg.resolveLeaderColumns(headers));
  const mapped = context.mapLeaders_({
    headers: headers,
    rows: [[
      HUB, 'Hub', 'One', 'hub@example.com', '555-0001', 'Ghana', 'Greater Accra', 'Accra',
      OTHER_HUB, '2026-01-01', 1, 0, 'Hub Pastor', PP_A
    ]]
  });
  assert.equal(mapped[0].reportsTo, PP_A);
  assert.equal(mapped[0].role, 'Hub Pastor');
  assert.equal(mapped[0].email, undefined);
  assert.equal(JSON.stringify(mapped).includes('hub@example.com'), false);
  assert.equal(JSON.stringify(mapped).includes('555-0001'), false);
});
