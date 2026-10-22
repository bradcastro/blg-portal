// ─────────────────────────────────────────────────────────────────────────
// BLG HIERARCHY ADDITIONS — paste these at the BOTTOM of BLG Portal V5.gs
// before the final closing brace / line of the file.
//
// Also do the following in the existing script:
//
//  1. UPDATE the Leaders sheet schema comment (around line 36–50):
//     Change:
//       // 12: Network Size
//       // 13+: Monthly snapshots (5 cols per month)
//     To:
//       // 12: Network Size
//       // 13: Role  (Hub Pastor | Partner Pastor | Group Leader)
//       // 14: ReportsTo UID  (BLG ID of supervisor)
//       // 15+: Monthly snapshots (5 cols per month)
//
//  2. UPDATE the monthly snapshot start column in any existing code
//     from 13 to 15.  Search the script for "13" near snapshot logic
//     and bump to 15.
//
//  3. IN YOUR GOOGLE SHEET — Leaders tab — add two column headers:
//     Col M (13): Role
//     Col N (14): ReportsTo UID
//
//  4. UPDATE lookupLeader handler to return role + reportsTo:
//     Find the section that builds the lookupLeader response object
//     and add:
//       role: row[12] || '',          // col 13
//       reportsTo: row[13] || '',     // col 14
//
// ─────────────────────────────────────────────────────────────────────────

// ── Column constants (Leaders sheet) ─────────────────────────────────────
var L_UID       = 1;   // A
var L_FIRST     = 2;   // B
var L_LAST      = 3;   // C
var L_EMAIL     = 4;   // D
var L_PHONE     = 5;   // E
var L_COUNTRY   = 6;   // F
var L_STATE     = 7;   // G
var L_CITY      = 8;   // H
var L_REFERRAL  = 9;   // I
var L_REG_DATE  = 10;  // J
var L_TOT_GRP   = 11;  // K
var L_NET_SIZE  = 12;  // L
var L_ROLE      = 13;  // M  ← NEW
var L_REPORTS_TO= 14;  // N  ← NEW
// Monthly snapshots: col 15+ (shifted from 13+)

// ── Column constants (Groups sheet) ──────────────────────────────────────
var G_UID       = 1;
var G_LEADER    = 2;
var G_NAME      = 3;
var G_COUNTRY   = 4;
var G_STATE     = 5;
var G_CITY      = 6;
var G_CREATED   = 7;
var G_ACTIVE    = 8;
var G_ORIG_OWN  = 9;
var G_XFER_CNT  = 10;

// ─────────────────────────────────────────────────────────────────────────
// HELPER: find a leader row by UID
// Returns {row: [...], rowIndex: N} or null
function findLeaderByUID_(uid) {
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Leaders');
  var data  = sheet.getDataRange().getValues();
  for (var i = 1; i < data.length; i++) {
    if (String(data[i][L_UID - 1]).trim() === String(uid).trim()) {
      return { row: data[i], rowIndex: i + 1 }; // 1-indexed sheet row
    }
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────
// getHierarchy
//   GET  ?type=getHierarchy&uid=BLG-XXXXX
//
//   If uid is a Hub Pastor → returns { role, partnerPastors: [{ uid, firstName,
//     lastName, city, country, groups: [{ uid, name, city, country,
//     checkinsThisWeek }] }] }
//
//   If uid is a Partner Pastor → returns { role, hubPastor: { uid, firstName,
//     lastName }, groups: [{ uid, name, city, country, checkinsThisWeek }] }
//
function handleGetHierarchy_(uid) {
  var leaderData = findLeaderByUID_(uid);
  if (!leaderData) return { success: false, message: 'Leader not found' };

  var row  = leaderData.row;
  var role = String(row[L_ROLE - 1] || '').trim();

  if (role === 'Hub Pastor') {
    return buildHubPastorHierarchy_(uid);
  } else {
    return buildPartnerPastorHierarchy_(uid, row);
  }
}

function buildHubPastorHierarchy_(hubUID) {
  var leadersSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Leaders');
  var groupsSheet  = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Groups');
  var leadersData  = leadersSheet.getDataRange().getValues();
  var groupsData   = groupsSheet.getDataRange().getValues();

  // Find all Partner Pastors whose ReportsTo === hubUID
  var partnerPastors = [];
  for (var i = 1; i < leadersData.length; i++) {
    var lrow = leadersData[i];
    var reportsTo = String(lrow[L_REPORTS_TO - 1] || '').trim();
    if (reportsTo === hubUID) {
      var ppUID = String(lrow[L_UID - 1]).trim();
      var groups = getGroupsForLeader_(ppUID, groupsData);
      partnerPastors.push({
        uid:       ppUID,
        firstName: lrow[L_FIRST - 1] || '',
        lastName:  lrow[L_LAST - 1]  || '',
        city:      lrow[L_CITY - 1]  || '',
        country:   lrow[L_COUNTRY - 1] || '',
        groups:    groups
      });
    }
  }

  return { success: true, role: 'Hub Pastor', partnerPastors: partnerPastors };
}

function buildPartnerPastorHierarchy_(ppUID, ppRow) {
  var groupsSheet  = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Groups');
  var groupsData   = groupsSheet.getDataRange().getValues();
  var groups       = getGroupsForLeader_(ppUID, groupsData);

  var hubPastor = null;
  var reportsTo = String(ppRow[L_REPORTS_TO - 1] || '').trim();
  if (reportsTo) {
    var hpData = findLeaderByUID_(reportsTo);
    if (hpData) {
      hubPastor = {
        uid:       reportsTo,
        firstName: hpData.row[L_FIRST - 1] || '',
        lastName:  hpData.row[L_LAST - 1]  || ''
      };
    }
  }

  return { success: true, role: 'Partner Pastor', groups: groups, hubPastor: hubPastor };
}

function getGroupsForLeader_(leaderUID, groupsData) {
  var now = new Date();
  var weekStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  var checkinsSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Checkins');
  var checkinsData  = checkinsSheet ? checkinsSheet.getDataRange().getValues() : [];

  var groups = [];
  for (var i = 1; i < groupsData.length; i++) {
    var grow = groupsData[i];
    var active    = grow[G_ACTIVE - 1];
    var curLeader = String(grow[G_LEADER - 1] || '').trim();
    if (curLeader !== leaderUID) continue;
    if (active === false || String(active).toLowerCase() === 'false') continue;

    var groupUID = String(grow[G_UID - 1]).trim();

    // Count this-week check-ins for this group
    var weekCount = 0;
    for (var c = 1; c < checkinsData.length; c++) {
      var crow = checkinsData[c];
      // Checkins sheet: assumed col 1=groupUID, col 2=date (or similar)
      // Adjust column indices to match your actual Checkins sheet layout
      if (String(crow[0]).trim() === groupUID) {
        var ciDate = new Date(crow[1]);
        if (!isNaN(ciDate.getTime()) && ciDate >= weekStart) weekCount++;
      }
    }

    groups.push({
      uid:     groupUID,
      name:    grow[G_NAME - 1]    || '',
      city:    grow[G_CITY - 1]    || '',
      country: grow[G_COUNTRY - 1] || '',
      checkinsThisWeek: weekCount
    });
  }
  return groups;
}

// ─────────────────────────────────────────────────────────────────────────
// assignReportsTo
//   POST  { type: 'assignReportsTo', leaderUID, supervisorUID }
//   Sets leaderUID's ReportsTo column to supervisorUID.
//
function handleAssignReportsTo_(leaderUID, supervisorUID) {
  // Validate supervisor exists and is a Hub Pastor
  var supData = findLeaderByUID_(supervisorUID);
  if (!supData) return { success: false, message: 'Supervisor not found' };
  var supRole = String(supData.row[L_ROLE - 1] || '').trim();
  if (supRole !== 'Hub Pastor') return { success: false, message: 'The specified leader is not a Hub Pastor' };

  // Find the target leader
  var leaderData = findLeaderByUID_(leaderUID);
  if (!leaderData) return { success: false, message: 'Leader not found' };

  // Write ReportsTo
  var sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Leaders');
  sheet.getRange(leaderData.rowIndex, L_REPORTS_TO).setValue(supervisorUID);
  SpreadsheetApp.flush();

  return { success: true, message: 'Assignment saved' };
}

// ─────────────────────────────────────────────────────────────────────────
// getCheckinReport
//   GET  ?type=getCheckinReport&uid=BLG-XXXXX&startDate=YYYY-MM-DD&endDate=YYYY-MM-DD
//
//   Returns all check-ins for groups under the given leader's hierarchy,
//   within the specified date range.
//
function handleGetCheckinReport_(uid, startDate, endDate) {
  var leaderData = findLeaderByUID_(uid);
  if (!leaderData) return { success: false, rows: [], message: 'Leader not found' };

  var role = String(leaderData.row[L_ROLE - 1] || '').trim();
  var start = new Date(startDate);
  var end   = new Date(endDate);
  end.setHours(23, 59, 59, 999);

  // Collect all relevant group UIDs
  var groupUIDs = collectGroupUIDs_(uid, role);
  if (!groupUIDs.length) return { success: true, rows: [], message: 'No groups found' };

  // Read Checkins sheet
  var checkinsSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Checkins');
  if (!checkinsSheet) return { success: true, rows: [], message: 'Checkins sheet not found' };
  var checkinsData = checkinsSheet.getDataRange().getValues();

  // Build group UID → name map
  var groupsSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Groups');
  var groupsData  = groupsSheet.getDataRange().getValues();
  var groupNames  = {};
  for (var g = 1; g < groupsData.length; g++) {
    var gUID = String(groupsData[g][G_UID - 1]).trim();
    groupNames[gUID] = groupsData[g][G_NAME - 1] || gUID;
  }

  // Build leader UID → name map
  var leadersSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Leaders');
  var leadersData  = leadersSheet.getDataRange().getValues();
  var leaderNames  = {};
  for (var l = 1; l < leadersData.length; l++) {
    var lUID = String(leadersData[l][L_UID - 1]).trim();
    leaderNames[lUID] = (leadersData[l][L_FIRST - 1] || '') + ' ' + (leadersData[l][L_LAST - 1] || '');
  }

  // Filter check-ins
  // Checkins sheet assumed layout (adjust column indices to your actual sheet):
  //   Col 1: Checkin UID / row ID
  //   Col 2: Group UID
  //   Col 3: Leader UID
  //   Col 4: Date
  //   Col 5: Attendees
  //   Col 6: Notes
  var rows = [];
  for (var c = 1; c < checkinsData.length; c++) {
    var crow   = checkinsData[c];
    var cGroup = String(crow[1] || '').trim(); // col 2 = Group UID
    var cDate  = new Date(crow[3]);            // col 4 = Date
    if (!groupUIDs.hasOwnProperty(cGroup)) continue;
    if (isNaN(cDate.getTime())) continue;
    if (cDate < start || cDate > end) continue;
    var cLeader = String(crow[2] || '').trim(); // col 3 = Leader UID
    rows.push({
      date:       Utilities.formatDate(cDate, Session.getScriptTimeZone(), 'yyyy-MM-dd'),
      groupUID:   cGroup,
      groupName:  groupNames[cGroup] || cGroup,
      leaderUID:  cLeader,
      leaderName: leaderNames[cLeader] || cLeader,
      attendees:  crow[4] || 0,
      notes:      crow[5] || ''
    });
  }

  // Sort by date descending
  rows.sort(function(a, b) { return b.date.localeCompare(a.date); });

  return { success: true, rows: rows };
}

// Returns an object { groupUID: true } for all groups under the leader's scope
function collectGroupUIDs_(uid, role) {
  var groupsSheet  = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Groups');
  var groupsData   = groupsSheet.getDataRange().getValues();
  var leadersSheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Leaders');
  var leadersData  = leadersSheet.getDataRange().getValues();
  var result = {};

  if (role === 'Hub Pastor') {
    // Collect all Partner Pastors under this Hub Pastor
    var ppUIDs = {};
    ppUIDs[uid] = true; // also include HP's direct groups
    for (var i = 1; i < leadersData.length; i++) {
      var reportsTo = String(leadersData[i][L_REPORTS_TO - 1] || '').trim();
      if (reportsTo === uid) {
        ppUIDs[String(leadersData[i][L_UID - 1]).trim()] = true;
      }
    }
    // Collect all groups led by those leaders
    for (var g = 1; g < groupsData.length; g++) {
      var active = groupsData[g][G_ACTIVE - 1];
      if (active === false || String(active).toLowerCase() === 'false') continue;
      var curLeader = String(groupsData[g][G_LEADER - 1] || '').trim();
      if (ppUIDs[curLeader]) {
        result[String(groupsData[g][G_UID - 1]).trim()] = true;
      }
    }
  } else {
    // Partner Pastor — only their own groups
    for (var g2 = 1; g2 < groupsData.length; g2++) {
      var active2 = groupsData[g2][G_ACTIVE - 1];
      if (active2 === false || String(active2).toLowerCase() === 'false') continue;
      if (String(groupsData[g2][G_LEADER - 1] || '').trim() === uid) {
        result[String(groupsData[g2][G_UID - 1]).trim()] = true;
      }
    }
  }
  return result;
}

// ─────────────────────────────────────────────────────────────────────────
// WIRE THESE INTO doGet / doPost
//
// In the existing doGet function, add these cases to the switch:
//
//   case 'getHierarchy':
//     return jsonResponse_(handleGetHierarchy_(params.uid));
//
//   case 'getCheckinReport':
//     return jsonResponse_(handleGetCheckinReport_(
//       params.uid, params.startDate, params.endDate));
//
// In the existing doPost function, add these cases to the switch:
//
//   case 'assignReportsTo':
//     return jsonResponse_(handleAssignReportsTo_(
//       body.leaderUID, body.supervisorUID));
//
// ─────────────────────────────────────────────────────────────────────────
// ALSO UPDATE lookupLeader to return role + reportsTo.
// Find the response object in handleLookupLeader_ (or similar) and add:
//
//   role:      row[L_ROLE - 1]       || '',
//   reportsTo: row[L_REPORTS_TO - 1] || '',
//
// (These constants L_ROLE=13 and L_REPORTS_TO=14 are defined above.)
// ─────────────────────────────────────────────────────────────────────────
