// ─────────────────────────────────────────────────────────────────────────
// BLG report and hierarchy helpers.
//
// If these functions are already in the Apps Script project, replace the old
// copies. Do not paste a second copy, and do not add a time-driven trigger.
// Deploy a new web-app version after replacing them. GitHub Pages does not
// update this script.
//
// WEEKLY EMAIL IS NOT IMPLEMENTED HERE.
// Do not add MailApp, GmailApp, or a clock trigger in this file.
// When a weekly send is later approved, each leader may receive only the
// groups from groupsAuthorizedForLeader_ for that leader's own UID:
//   - active groups they currently lead, plus
//   - only when Role is exactly "Hub Pastor", active groups currently led by
//     people whose ReportsTo value is exactly that hub's BLG ID.
// The network is one level deep. Referral Leader UID, Original Owner UID, and
// a browser's local pastor list are not relationships. A ReportsTo cell counts
// only when it is BLG-#####; a monthly-metric number in that column does not.
// Weekday, time, timezone, sender account, and whether a person reviews the
// report before it is sent are still unresolved. Do not guess them here.
//
// Leaders sheet header note (verified, not assumed):
// Column M can contain one cell "Role<tab>ReportsTo UID", and column N's
// header can be a monthly metric while its values are supervisor UIDs.
// resolveLeaderColumns_ reads Role from that cell and ReportsTo from the next
// column. Split headers "Role" and "ReportsTo UID" are also recognized.
// ─────────────────────────────────────────────────────────────────────────

var L_UID = 1;
var L_FIRST = 2;
var L_LAST = 3;
var L_ROLE = 13;
var L_REPORTS_TO = 14;

function isLeaderUid_(value) {
  return /^BLG-\d{5}$/.test(String(value == null ? '' : value).trim());
}

function isGroupActive_(active) {
  // Deployed reports skip only boolean false and the text "false".
  // The Groups sheet stores Active as YES/NO text, so "YES" stays included.
  // "NO" is not excluded today; keep that until the column is explicitly remapped.
  if (active === false) return false;
  if (String(active).toLowerCase() === 'false') return false;
  return true;
}

function isHubPastor_(leader) {
  return String(leader && leader.role == null ? '' : leader.role).trim() === 'Hub Pastor';
}

function supervisorUid_(leader) {
  var value = String(leader && leader.reportsTo == null ? '' : leader.reportsTo).trim();
  return isLeaderUid_(value) ? value : '';
}

function normalizeHeader_(value) {
  return String(value == null ? '' : value).replace(/[\t\r\n]+/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
}

function resolveLeaderColumns_(headers) {
  var cols = { uid: 0, first: 1, last: 2, country: 5, city: 7, role: 12, reportsTo: 13 };
  var list = headers || [];
  for (var i = 0; i < list.length; i++) {
    var norm = normalizeHeader_(list[i]);
    if (norm === 'first name') cols.first = i;
    else if (norm === 'last name') cols.last = i;
    else if (norm === 'country') cols.country = i;
    else if (norm === 'city') cols.city = i;
    else if (norm === 'leader uid' || norm === 'uid' || norm === 'blg uid') cols.uid = i;
    else if (norm === 'role' || norm === 'leader role') cols.role = i;
    else if (norm.indexOf('role') === 0 && norm.indexOf('report') !== -1) {
      cols.role = i;
      cols.reportsTo = i + 1;
    }
    if (norm === 'reports to uid' || norm === 'reports to' || norm === 'reportsto uid' || norm === 'supervisor uid') {
      cols.reportsTo = i;
    }
  }
  return cols;
}

function resolveGroupColumns_(headers) {
  var cols = { uid: 0, leader: 1, name: 2, country: 3, state: 4, city: 5, created: 6, active: 7, originalOwner: 8 };
  var list = headers || [];
  for (var i = 0; i < list.length; i++) {
    var norm = normalizeHeader_(list[i]);
    if (norm === 'group uid') cols.uid = i;
    else if (norm === 'current leader uid' || norm === 'leader uid') cols.leader = i;
    else if (norm === 'group name') cols.name = i;
    else if (norm === 'country') cols.country = i;
    else if (norm.indexOf('state') === 0) cols.state = i;
    else if (norm === 'city') cols.city = i;
    else if (norm === 'created date' || norm === 'created') cols.created = i;
    else if (norm === 'active') cols.active = i;
    else if (norm === 'original owner uid') cols.originalOwner = i;
  }
  return cols;
}

function resolveCheckinColumns_(headers) {
  var cols = { groupUid: 0, attendees: 1, meetingDate: 2, week: 3, submittedAt: 4 };
  var list = headers || [];
  for (var i = 0; i < list.length; i++) {
    var norm = normalizeHeader_(list[i]);
    if (norm === 'group uid') cols.groupUid = i;
    else if (norm === 'attendee count' || norm === 'attendees') cols.attendees = i;
    else if (norm === 'meeting date') cols.meetingDate = i;
    else if (norm === 'week') cols.week = i;
    else if (norm === 'submitted at') cols.submittedAt = i;
  }
  return cols;
}

function trimName_(first, last) {
  return String((first || '') + ' ' + (last || '')).replace(/\s+/g, ' ').trim();
}

function groupsAuthorizedForLeader_(viewerUid, leaders, groups) {
  var id = String(viewerUid == null ? '' : viewerUid).trim();
  var viewer = null;
  var list = leaders || [];
  for (var i = 0; i < list.length; i++) {
    if (String(list[i].uid == null ? '' : list[i].uid).trim() === id) viewer = list[i];
  }
  if (!viewer) return [];
  var allowedLeaders = {};
  allowedLeaders[id] = true;
  if (isHubPastor_(viewer)) {
    for (var j = 0; j < list.length; j++) {
      if (supervisorUid_(list[j]) === id) {
        allowedLeaders[String(list[j].uid == null ? '' : list[j].uid).trim()] = true;
      }
    }
  }
  var result = [];
  var groupList = groups || [];
  for (var g = 0; g < groupList.length; g++) {
    var group = groupList[g];
    if (!isGroupActive_(group.active)) continue;
    if (!allowedLeaders[String(group.leaderUid == null ? '' : group.leaderUid).trim()]) continue;
    result.push(group);
  }
  return result;
}

function presentNetwork_(viewerUid, leaders, groups) {
  var id = String(viewerUid == null ? '' : viewerUid).trim();
  var viewer = null;
  var list = leaders || [];
  for (var i = 0; i < list.length; i++) {
    if (String(list[i].uid == null ? '' : list[i].uid).trim() === id) viewer = list[i];
  }
  var allowed = groupsAuthorizedForLeader_(viewerUid, leaders, groups);
  var directGroups = [];
  var byLeader = {};
  for (var g = 0; g < allowed.length; g++) {
    var group = allowed[g];
    var copy = {
      uid: String(group.uid == null ? '' : group.uid).trim(),
      leaderUid: String(group.leaderUid == null ? '' : group.leaderUid).trim(),
      name: group.name ? String(group.name) : '',
      city: group.city ? String(group.city) : '',
      country: group.country ? String(group.country) : '',
      created: group.created ? String(group.created) : ''
    };
    if (copy.leaderUid === id) directGroups.push(copy);
    else {
      if (!byLeader[copy.leaderUid]) byLeader[copy.leaderUid] = [];
      byLeader[copy.leaderUid].push(copy);
    }
  }
  var subordinates = [];
  if (viewer && isHubPastor_(viewer)) {
    for (var s = 0; s < list.length; s++) {
      var leaderId = String(list[s].uid == null ? '' : list[s].uid).trim();
      if (!leaderId || leaderId === id) continue;
      if (supervisorUid_(list[s]) !== id) continue;
      subordinates.push({
        uid: leaderId,
        first: list[s].first || list[s].firstName || '',
        last: list[s].last || list[s].lastName || '',
        city: list[s].city ? String(list[s].city) : '',
        country: list[s].country ? String(list[s].country) : '',
        groups: byLeader[leaderId] || []
      });
    }
  }
  return { directGroups: directGroups, subordinates: subordinates };
}

function readSheet_(name) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(name);
  if (!sheet) return null;
  var values = sheet.getDataRange().getValues();
  var rows = [];
  for (var i = 1; i < values.length; i++) rows.push(values[i]);
  return { sheet: sheet, headers: values[0] || [], rows: rows };
}

function mapLeaders_(table) {
  var cols = resolveLeaderColumns_(table.headers);
  var out = [];
  for (var i = 0; i < table.rows.length; i++) {
    var row = table.rows[i];
    var uid = String(row[cols.uid] || '').trim();
    if (!uid) continue;
    out.push({
      uid: uid,
      first: row[cols.first] || '',
      last: row[cols.last] || '',
      role: row[cols.role] || '',
      reportsTo: row[cols.reportsTo] || '',
      city: row[cols.city] || '',
      country: row[cols.country] || '',
      rowIndex: i + 2
    });
  }
  return out;
}

function mapGroups_(table) {
  if (!table) return [];
  var cols = resolveGroupColumns_(table.headers);
  var out = [];
  for (var i = 0; i < table.rows.length; i++) {
    var row = table.rows[i];
    var uid = String(row[cols.uid] || '').trim();
    if (!uid) continue;
    out.push({
      uid: uid,
      leaderUid: String(row[cols.leader] || '').trim(),
      name: row[cols.name] || '',
      city: row[cols.city] || '',
      country: row[cols.country] || '',
      created: row[cols.created] || '',
      active: row[cols.active]
    });
  }
  return out;
}

function dateKey_(value) {
  if (Object.prototype.toString.call(value) === '[object Date]' && !isNaN(value.getTime())) {
    return Utilities.formatDate(value, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }
  var match = String(value == null ? '' : value).match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : '';
}

function findLeaderByUID_(uid) {
  var table = readSheet_('Leaders');
  if (!table) return null;
  var leaders = mapLeaders_(table);
  var id = String(uid == null ? '' : uid).trim();
  for (var i = 0; i < leaders.length; i++) {
    if (leaders[i].uid === id) {
      return { row: table.rows[leaders[i].rowIndex - 2], rowIndex: leaders[i].rowIndex, leader: leaders[i] };
    }
  }
  return null;
}

function recentCheckinCounts_(checkinsTable) {
  var counts = {};
  if (!checkinsTable) return counts;
  var cols = resolveCheckinColumns_(checkinsTable.headers);
  var weekStart = new Date(new Date().getTime() - 7 * 24 * 60 * 60 * 1000);
  for (var i = 0; i < checkinsTable.rows.length; i++) {
    var row = checkinsTable.rows[i];
    var uid = String(row[cols.groupUid] || '').trim();
    var raw = row[cols.meetingDate];
    var when = Object.prototype.toString.call(raw) === '[object Date]' ? raw : new Date(raw);
    if (!uid || isNaN(when.getTime()) || when < weekStart) continue;
    counts[uid] = (counts[uid] || 0) + 1;
  }
  return counts;
}

function withCheckinCounts_(groups, counts) {
  var out = [];
  for (var i = 0; i < groups.length; i++) {
    out.push({
      uid: groups[i].uid,
      name: groups[i].name || '',
      city: groups[i].city || '',
      country: groups[i].country || '',
      checkinsThisWeek: counts[groups[i].uid] || 0
    });
  }
  return out;
}

function buildHierarchyResponse_(uid) {
  var leadersTable = readSheet_('Leaders');
  if (!leadersTable) return { success: false, message: 'Leader not found' };
  var leaders = mapLeaders_(leadersTable);
  var id = String(uid == null ? '' : uid).trim();
  var viewer = null;
  for (var i = 0; i < leaders.length; i++) {
    if (leaders[i].uid === id) viewer = leaders[i];
  }
  if (!viewer) return { success: false, message: 'Leader not found' };
  var network = presentNetwork_(id, leaders, mapGroups_(readSheet_('Groups')));
  var counts = recentCheckinCounts_(readSheet_('Checkins'));
  if (isHubPastor_(viewer)) {
    var pastors = [];
    for (var p = 0; p < network.subordinates.length; p++) {
      var sub = network.subordinates[p];
      pastors.push({
        uid: sub.uid,
        firstName: sub.first || '',
        lastName: sub.last || '',
        city: sub.city || '',
        country: sub.country || '',
        groups: withCheckinCounts_(sub.groups, counts)
      });
    }
    return {
      success: true,
      role: 'Hub Pastor',
      partnerPastors: pastors,
      directGroups: withCheckinCounts_(network.directGroups, counts)
    };
  }
  var supervisor = supervisorUid_(viewer);
  var hubPastor = null;
  if (supervisor) {
    for (var h = 0; h < leaders.length; h++) {
      if (leaders[h].uid === supervisor) {
        hubPastor = { uid: supervisor, firstName: leaders[h].first || '', lastName: leaders[h].last || '' };
        break;
      }
    }
  }
  return {
    success: true,
    role: 'Partner Pastor',
    groups: withCheckinCounts_(network.directGroups, counts),
    hubPastor: hubPastor
  };
}

function handleGetHierarchy_(uid) {
  return buildHierarchyResponse_(uid);
}

function buildHubPastorHierarchy_(hubUID) {
  return buildHierarchyResponse_(hubUID);
}

function buildPartnerPastorHierarchy_(ppUID) {
  return buildHierarchyResponse_(ppUID);
}

function getGroupsForLeader_(leaderUID, groupsData) {
  var headers = groupsData && groupsData.length ? groupsData[0] : [];
  var rows = [];
  for (var i = 1; i < (groupsData || []).length; i++) rows.push(groupsData[i]);
  var groups = mapGroups_({ headers: headers, rows: rows });
  var counts = recentCheckinCounts_(readSheet_('Checkins'));
  var id = String(leaderUID == null ? '' : leaderUID).trim();
  var out = [];
  for (var g = 0; g < groups.length; g++) {
    if (groups[g].leaderUid !== id || !isGroupActive_(groups[g].active)) continue;
    out.push({
      uid: groups[g].uid,
      name: groups[g].name || '',
      city: groups[g].city || '',
      country: groups[g].country || '',
      checkinsThisWeek: counts[groups[g].uid] || 0
    });
  }
  return out;
}

function handleAssignReportsTo_(leaderUID, supervisorUID) {
  if (!isLeaderUid_(leaderUID) || !isLeaderUid_(supervisorUID)) {
    return { success: false, message: 'Leader not found' };
  }
  var table = readSheet_('Leaders');
  if (!table) return { success: false, message: 'Leader not found' };
  var leaders = mapLeaders_(table);
  var supervisor = null;
  var leader = null;
  var supervisorId = String(supervisorUID).trim();
  var leaderId = String(leaderUID).trim();
  for (var i = 0; i < leaders.length; i++) {
    if (leaders[i].uid === supervisorId) supervisor = leaders[i];
    if (leaders[i].uid === leaderId) leader = leaders[i];
  }
  if (!supervisor) return { success: false, message: 'Supervisor not found' };
  if (!isHubPastor_(supervisor)) return { success: false, message: 'The specified leader is not a Hub Pastor' };
  if (!leader) return { success: false, message: 'Leader not found' };
  var cols = resolveLeaderColumns_(table.headers);
  table.sheet.getRange(leader.rowIndex, cols.reportsTo + 1).setValue(supervisorId);
  SpreadsheetApp.flush();
  return { success: true, message: 'Assignment saved' };
}

function handleGetCheckinReport_(uid, startDate, endDate) {
  var leadersTable = readSheet_('Leaders');
  if (!leadersTable) return { success: false, rows: [], message: 'Leader not found' };
  var leaders = mapLeaders_(leadersTable);
  var id = String(uid == null ? '' : uid).trim();
  var viewer = null;
  var names = {};
  for (var i = 0; i < leaders.length; i++) {
    names[leaders[i].uid] = trimName_(leaders[i].first, leaders[i].last);
    if (leaders[i].uid === id) viewer = leaders[i];
  }
  if (!viewer) return { success: false, rows: [], message: 'Leader not found' };
  var allowed = groupsAuthorizedForLeader_(id, leaders, mapGroups_(readSheet_('Groups')));
  var allowedIds = {};
  var groupInfo = {};
  for (var g = 0; g < allowed.length; g++) {
    allowedIds[allowed[g].uid] = true;
    groupInfo[allowed[g].uid] = allowed[g];
  }
  var checkinsTable = readSheet_('Checkins');
  if (!checkinsTable) return { success: true, rows: [] };
  var cols = resolveCheckinColumns_(checkinsTable.headers);
  var start = dateKey_(startDate);
  var end = dateKey_(endDate);
  var rows = [];
  for (var c = 0; c < checkinsTable.rows.length; c++) {
    var row = checkinsTable.rows[c];
    var groupUid = String(row[cols.groupUid] || '').trim();
    var day = dateKey_(row[cols.meetingDate]);
    if (!allowedIds[groupUid] || !day || (start && day < start) || (end && day > end)) continue;
    var leaderUid = groupInfo[groupUid].leaderUid;
    rows.push({
      date: day,
      groupUID: groupUid,
      groupName: groupInfo[groupUid].name || groupUid,
      leaderUID: leaderUid,
      leaderName: names[leaderUid] || leaderUid,
      attendees: row[cols.attendees] || 0,
      week: row[cols.week] || ''
    });
  }
  rows.sort(function (a, b) {
    if (a.date === b.date) return 0;
    return a.date < b.date ? 1 : -1;
  });
  return { success: true, rows: rows };
}

// Scoped inactive list for a future deploy. The copy currently published as
// getInactiveGroups ignores the leader and returns every group. Do not point
// the portal at that handler. Replace it with this function, which returns
// only groupsAuthorizedForLeader_, then deploy a new web-app version.
// This function does not send email.
function handleGetInactiveGroups_(uid, weeks) {
  var leadersTable = readSheet_('Leaders');
  if (!leadersTable) return { success: false, scoped: true, groups: [], message: 'Leader not found' };
  var leaders = mapLeaders_(leadersTable);
  var id = String(uid == null ? '' : uid).trim();
  var viewer = null;
  for (var i = 0; i < leaders.length; i++) {
    if (leaders[i].uid === id) viewer = leaders[i];
  }
  if (!viewer) return { success: false, scoped: true, groups: [], message: 'Leader not found' };
  var network = presentNetwork_(id, leaders, mapGroups_(readSheet_('Groups')));
  var scope = [];
  for (var d = 0; d < network.directGroups.length; d++) {
    var own = network.directGroups[d];
    scope.push({
      uid: own.uid,
      name: own.name,
      city: own.city,
      country: own.country,
      leaderUID: id,
      leaderName: trimName_(viewer.first, viewer.last),
      created: own.created || ''
    });
  }
  for (var s = 0; s < network.subordinates.length; s++) {
    var sub = network.subordinates[s];
    for (var g = 0; g < sub.groups.length; g++) {
      scope.push({
        uid: sub.groups[g].uid,
        name: sub.groups[g].name,
        city: sub.groups[g].city,
        country: sub.groups[g].country,
        leaderUID: sub.uid,
        leaderName: trimName_(sub.first, sub.last),
        created: sub.groups[g].created || ''
      });
    }
  }
  var days = Number(weeks);
  if (!isFinite(days) || days < 0) days = 4;
  var cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - (days * 7));
  var cutoff = Utilities.formatDate(cutoffDate, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  var recent = {};
  var checkinsTable = readSheet_('Checkins');
  if (checkinsTable) {
    var cols = resolveCheckinColumns_(checkinsTable.headers);
    for (var c = 0; c < checkinsTable.rows.length; c++) {
      var row = checkinsTable.rows[c];
      var groupUid = String(row[cols.groupUid] || '').trim();
      var day = dateKey_(row[cols.meetingDate]);
      if (groupUid && day && day >= cutoff) recent[groupUid] = true;
    }
  }
  var inactive = [];
  for (var n = 0; n < scope.length; n++) {
    if (!recent[scope[n].uid]) inactive.push(scope[n]);
  }
  return { success: true, scoped: true, uid: id, cutoffDate: cutoff, groups: inactive };
}

function collectGroupUIDs_(uid) {
  var leadersTable = readSheet_('Leaders');
  if (!leadersTable) return {};
  var allowed = groupsAuthorizedForLeader_(uid, mapLeaders_(leadersTable), mapGroups_(readSheet_('Groups')));
  var result = {};
  for (var i = 0; i < allowed.length; i++) result[allowed[i].uid] = true;
  return result;
}

// ─────────────────────────────────────────────────────────────────────────
// WIRE THESE INTO doGet / doPost. Do not add getAllHierarchy.
// Do not add a trigger or a MailApp call.
//
// doGet:
//   case 'getHierarchy':
//     return jsonResponse_(handleGetHierarchy_(params.uid));
//   case 'getCheckinReport':
//     return jsonResponse_(handleGetCheckinReport_(params.uid, params.startDate, params.endDate));
//   case 'getInactiveGroups':
//     // Replace the old unscoped handler with this one before deploying.
//     return jsonResponse_(handleGetInactiveGroups_(params.uid, params.weeks));
//
// doPost:
//   case 'assignReportsTo':
//     return jsonResponse_(handleAssignReportsTo_(body.leaderUID, body.supervisorUID));
// ─────────────────────────────────────────────────────────────────────────
