/*
 * Check-in report rules for the BLG Hub Portal.
 *
 * Scope matches the deployed getCheckinReport / collectGroupUIDs_ behavior:
 *   - Every leader sees active groups they currently lead.
 *   - A leader whose Role is exactly "Hub Pastor" also sees active groups
 *     currently led by people whose ReportsTo value is exactly that hub's UID.
 *   - That network is one level deep. A partner pastor's own reports are not
 *     included, and a hub does not inherit a partner pastor's downline.
 *   - ReportsTo counts only when it is a BLG-##### id. A monthly-metric number
 *     sitting in that column does not create a relationship.
 *   - Referral Leader UID, Original Owner UID, and the browser's local pastor
 *     list are not report relationships.
 *   - Self-reporting does not grant a second copy of a leader's groups.
 *
 * Weekly email is not sent from here. buildLeaderReport() is the per-leader
 * payload a future mailer would be allowed to send: one recipient, only the
 * groups above, no email addresses or phone numbers. Weekday, time, sender,
 * and send-review are intentionally not decided in this file.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.BLGReports = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  var UID_RE = /^BLG-\d{5}$/;

  function trim(value) {
    return String(value == null ? '' : value).trim();
  }

  function isLeaderUid(value) {
    return UID_RE.test(trim(value));
  }

  function normalizeHeader(value) {
    return trim(String(value == null ? '' : value).replace(/[\t\r\n]+/g, ' ')).replace(/\s+/g, ' ').toLowerCase();
  }

  function resolveLeaderColumns(headers) {
    var cols = { uid: 0, first: 1, last: 2, country: 5, city: 7, role: 12, reportsTo: 13 };
    (headers || []).forEach(function (header, i) {
      var norm = normalizeHeader(header);
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
    });
    return cols;
  }

  function resolveGroupColumns(headers) {
    var cols = { uid: 0, leader: 1, name: 2, country: 3, state: 4, city: 5, created: 6, active: 7, originalOwner: 8 };
    (headers || []).forEach(function (header, i) {
      var norm = normalizeHeader(header);
      if (norm === 'group uid') cols.uid = i;
      else if (norm === 'current leader uid' || norm === 'leader uid') cols.leader = i;
      else if (norm === 'group name') cols.name = i;
      else if (norm === 'country') cols.country = i;
      else if (norm.indexOf('state') === 0) cols.state = i;
      else if (norm === 'city') cols.city = i;
      else if (norm === 'created date' || norm === 'created') cols.created = i;
      else if (norm === 'active') cols.active = i;
      else if (norm === 'original owner uid') cols.originalOwner = i;
    });
    return cols;
  }

  function resolveCheckinColumns(headers) {
    var cols = { groupUid: 0, attendees: 1, meetingDate: 2, week: 3, submittedAt: 4 };
    (headers || []).forEach(function (header, i) {
      var norm = normalizeHeader(header);
      if (norm === 'group uid') cols.groupUid = i;
      else if (norm === 'attendee count' || norm === 'attendees') cols.attendees = i;
      else if (norm === 'meeting date') cols.meetingDate = i;
      else if (norm === 'week') cols.week = i;
      else if (norm === 'submitted at') cols.submittedAt = i;
    });
    return cols;
  }

  // Same Active test as the deployed report: only boolean false and the text
  // "false" drop a group. The sheet stores YES/NO text; YES stays included.
  function isGroupActive(active) {
    if (active === false) return false;
    if (String(active).toLowerCase() === 'false') return false;
    return true;
  }

  function isHubPastor(leader) {
    return trim(leader && leader.role) === 'Hub Pastor';
  }

  function supervisorUid(leader) {
    var value = trim(leader && leader.reportsTo);
    return isLeaderUid(value) ? value : '';
  }

  function findLeader(leaders, uid) {
    var id = trim(uid);
    for (var i = 0; i < (leaders || []).length; i++) {
      if (trim(leaders[i].uid) === id) return leaders[i];
    }
    return null;
  }

  function leaderDisplayName(leader) {
    if (!leader) return '';
    return trim((leader.first || leader.firstName || '') + ' ' + (leader.last || leader.lastName || ''));
  }

  function publicGroup(group) {
    return {
      uid: trim(group && group.uid),
      leaderUid: trim(group && group.leaderUid),
      name: group && group.name ? String(group.name) : '',
      city: group && group.city ? String(group.city) : '',
      country: group && group.country ? String(group.country) : '',
      created: group && group.created ? String(group.created) : ''
    };
  }

  function publicLeader(leader) {
    return {
      uid: trim(leader && leader.uid),
      first: leader && (leader.first || leader.firstName) ? String(leader.first || leader.firstName) : '',
      last: leader && (leader.last || leader.lastName) ? String(leader.last || leader.lastName) : '',
      city: leader && leader.city ? String(leader.city) : '',
      country: leader && leader.country ? String(leader.country) : ''
    };
  }

  function groupsAuthorizedForLeader(viewerUid, leaders, groups) {
    var viewer = findLeader(leaders, viewerUid);
    if (!viewer) return [];
    var id = trim(viewerUid);
    var allowedLeaders = {};
    allowedLeaders[id] = true;
    if (isHubPastor(viewer)) {
      (leaders || []).forEach(function (leader) {
        if (supervisorUid(leader) === id) allowedLeaders[trim(leader.uid)] = true;
      });
    }
    var result = [];
    (groups || []).forEach(function (group) {
      if (!isGroupActive(group.active)) return;
      if (!allowedLeaders[trim(group.leaderUid)]) return;
      result.push(group);
    });
    return result;
  }

  function presentNetwork(viewerUid, leaders, groups) {
    var viewer = findLeader(leaders, viewerUid);
    var allowed = groupsAuthorizedForLeader(viewerUid, leaders, groups);
    var id = trim(viewerUid);
    var directGroups = [];
    var byLeader = {};
    allowed.forEach(function (group) {
      var copy = publicGroup(group);
      if (copy.leaderUid === id) directGroups.push(copy);
      else {
        if (!byLeader[copy.leaderUid]) byLeader[copy.leaderUid] = [];
        byLeader[copy.leaderUid].push(copy);
      }
    });
    var subordinates = [];
    if (viewer && isHubPastor(viewer)) {
      (leaders || []).forEach(function (leader) {
        var leaderId = trim(leader.uid);
        if (!leaderId || leaderId === id) return;
        if (supervisorUid(leader) !== id) return;
        var card = publicLeader(leader);
        card.groups = byLeader[leaderId] || [];
        subordinates.push(card);
      });
    }
    return { directGroups: directGroups, subordinates: subordinates };
  }

  function finiteNumber(value) {
    var n = Number(value);
    return isFinite(n) ? n : 0;
  }

  function dateKey(value) {
    var match = String(value == null ? '' : value).match(/^(\d{4}-\d{2}-\d{2})/);
    return match ? match[1] : '';
  }

  function buildLeaderReport(viewerUid, leaders, groups, checkins, startDate, endDate) {
    var allowedGroups = groupsAuthorizedForLeader(viewerUid, leaders, groups);
    var allowed = {};
    var groupNames = {};
    var groupLeaders = {};
    allowedGroups.forEach(function (group) {
      var copy = publicGroup(group);
      allowed[copy.uid] = true;
      groupNames[copy.uid] = copy.name;
      groupLeaders[copy.uid] = copy.leaderUid;
    });
    var names = {};
    (leaders || []).forEach(function (leader) {
      names[trim(leader.uid)] = leaderDisplayName(leader);
    });
    var start = dateKey(startDate);
    var end = dateKey(endDate);
    var rows = [];
    (checkins || []).forEach(function (checkin) {
      var groupUid = trim(checkin.groupUID || checkin.uid);
      var day = dateKey(checkin.date);
      if (!allowed[groupUid] || !day || day < start || day > end) return;
      var leaderUid = groupLeaders[groupUid] || '';
      rows.push({
        date: day,
        groupUID: groupUid,
        groupName: groupNames[groupUid] || '',
        leaderUID: leaderUid,
        leaderName: names[leaderUid] || '',
        attendees: finiteNumber(checkin.attendees),
        week: checkin.week == null ? '' : String(checkin.week)
      });
    });
    rows.sort(function (a, b) {
      if (a.date !== b.date) return a.date < b.date ? 1 : -1;
      return a.groupUID < b.groupUID ? -1 : a.groupUID > b.groupUID ? 1 : 0;
    });
    var summary = summarizeCheckins(rows);
    var groupUids = allowedGroups.map(function (group) { return publicGroup(group).uid; });
    return {
      recipientUid: trim(viewerUid),
      rows: rows,
      meetings: summary.meetings,
      attendanceInstances: summary.attendanceInstances,
      groupUids: groupUids
    };
  }

  function publicCheckinRows(rows) {
    return (rows || []).map(function (row) {
      return {
        date: row.date || '',
        groupUID: row.groupUID || '',
        groupName: row.groupName || '',
        leaderUID: row.leaderUID || '',
        leaderName: row.leaderName || '',
        attendees: finiteNumber(row.attendees),
        week: row.week || ''
      };
    });
  }

  function summarizeCheckins(rows) {
    var clean = publicCheckinRows(rows);
    var groups = {};
    var attendanceInstances = 0;
    clean.forEach(function (row) {
      groups[row.groupUID] = true;
      attendanceInstances += row.attendees;
    });
    return {
      meetings: clean.length,
      attendanceInstances: attendanceInstances,
      groups: Object.keys(groups).length
    };
  }

  function checkinError(data) {
    if (!data || typeof data !== 'object') return 'Report could not be loaded.';
    if (data.success === false) return data.message || data.error || 'Report could not be loaded.';
    if (!Array.isArray(data.rows)) return 'Report could not be loaded.';
    return '';
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function localISODate(date) {
    var month = String(date.getMonth() + 1);
    var day = String(date.getDate());
    if (month.length < 2) month = '0' + month;
    if (day.length < 2) day = '0' + day;
    return date.getFullYear() + '-' + month + '-' + day;
  }

  function defaultReportRange(now) {
    return { start: now.getFullYear() + '-01-01', end: localISODate(now) };
  }

  function cutoffDate(today, weeks) {
    var date = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    date.setDate(date.getDate() - (Number(weeks) * 7));
    return localISODate(date);
  }

  function csvCell(value) {
    var text = String(value == null ? '' : value);
    if (/^[=+\-@]/.test(text)) text = "'" + text;
    if (/[",\r\n]/.test(text)) text = '"' + text.replace(/"/g, '""') + '"';
    return text;
  }

  function toCsv(rows) {
    var lines = ['Date,Group UID,Group,Leader UID,Leader,Attendees,Week'];
    publicCheckinRows(rows).forEach(function (row) {
      lines.push([
        row.date, row.groupUID, row.groupName, row.leaderUID, row.leaderName, row.attendees, row.week
      ].map(csvCell).join(','));
    });
    return lines.join('\r\n');
  }

  function renderCheckinReport(rows) {
    var clean = publicCheckinRows(rows);
    if (!clean.length) {
      return '<div class="empty-state"><p>No check-ins found in this date range.</p></div>';
    }
    var summary = summarizeCheckins(clean);
    var body = clean.map(function (row) {
      return '<tr><td>' + escapeHtml(row.date) + '</td><td>' + escapeHtml(row.groupName || row.groupUID) +
        '</td><td>' + escapeHtml(row.leaderName || row.leaderUID) +
        '</td><td style="text-align:center;font-weight:700">' + escapeHtml(row.attendees) + '</td></tr>';
    }).join('');
    return '<div class="ar-summary-bar">' +
      '<div>Meetings: <span>' + summary.meetings + '</span></div>' +
      '<div>Attendance instances: <span>' + summary.attendanceInstances + '</span></div>' +
      '<div>Groups: <span>' + summary.groups + '</span></div>' +
      '</div>' +
      '<p class="report-note">Attendance instances are the sum of reported attendance, not unique people.</p>' +
      '<button type="button" class="btn btn-outline btn-sm" style="margin-bottom:10px" onclick="downloadLastReport()">Download CSV</button>' +
      '<div class="report-table-wrap"><table class="report-table">' +
      '<thead><tr><th>Date</th><th>Group</th><th>Leader</th><th style="text-align:center">Attendees</th></tr></thead>' +
      '<tbody>' + body + '</tbody>' +
      '<tfoot><tr><td colspan="3" style="font-weight:700">Attendance instances</td>' +
      '<td style="text-align:center;font-weight:700">' + summary.attendanceInstances + '</td></tr></tfoot>' +
      '</table></div>';
  }

  function normalizeScopedHierarchy(data, viewer) {
    if (!data || typeof data !== 'object') {
      return { ok: false, message: 'Report could not be loaded.' };
    }
    if (data.success === false) {
      return { ok: false, message: data.message || data.error || 'Report could not be loaded.' };
    }
    if (Array.isArray(data.hubPastors) || Array.isArray(data.unassigned)) {
      return { ok: false, message: 'This report included other leaders and was not shown.' };
    }
    var viewerUid = trim(viewer && viewer.uid);
    var own = [];
    var seen = {};
    function addOwn(group) {
      var uid = trim(group && group.uid);
      if (!uid || seen[uid]) return;
      seen[uid] = true;
      own.push({
        uid: uid,
        name: group.name || '',
        city: group.city || '',
        country: group.country || '',
        leaderUID: viewerUid,
        checkinsThisWeek: finiteNumber(group.checkinsThisWeek)
      });
    }
    (data.directGroups || []).forEach(addOwn);
    (data.groups || []).forEach(addOwn);
    var subordinates = [];
    (data.partnerPastors || []).forEach(function (pastor) {
      var uid = trim(pastor && pastor.uid);
      if (!uid) return;
      if (uid === viewerUid) {
        (pastor.groups || []).forEach(addOwn);
        return;
      }
      subordinates.push({
        uid: uid,
        first: pastor.firstName || pastor.first || '',
        last: pastor.lastName || pastor.last || '',
        city: pastor.city || '',
        country: pastor.country || '',
        groups: (pastor.groups || []).map(function (group) {
          return {
            uid: trim(group.uid),
            name: group.name || '',
            city: group.city || '',
            country: group.country || '',
            leaderUID: uid,
            checkinsThisWeek: finiteNumber(group.checkinsThisWeek)
          };
        })
      });
    });
    var hubPastor = null;
    if (data.hubPastor && trim(data.hubPastor.uid) && trim(data.hubPastor.uid) !== viewerUid) {
      hubPastor = {
        uid: trim(data.hubPastor.uid),
        first: data.hubPastor.firstName || data.hubPastor.first || '',
        last: data.hubPastor.lastName || data.hubPastor.last || ''
      };
    }
    return {
      ok: true,
      role: data.role || '',
      ownGroups: own,
      subordinates: subordinates,
      hubPastor: hubPastor
    };
  }

  function addViewerGroupsFromCheckins(scope, rows, viewerUid) {
    if (!scope || !scope.ok) return scope;
    var seen = {};
    scope.ownGroups.forEach(function (group) { seen[group.uid] = true; });
    scope.subordinates.forEach(function (pastor) {
      (pastor.groups || []).forEach(function (group) { seen[group.uid] = true; });
    });
    var id = trim(viewerUid);
    (rows || []).forEach(function (row) {
      var uid = trim(row.groupUID || row.uid);
      if (!uid || seen[uid] || trim(row.leaderUID) !== id) return;
      seen[uid] = true;
      scope.ownGroups.push({
        uid: uid,
        name: row.groupName || row.name || '',
        city: row.city || '',
        country: row.country || '',
        leaderUID: id,
        checkinsThisWeek: 0
      });
    });
    return scope;
  }

  function groupsFromScope(scope, viewer) {
    if (!scope || !scope.ok) return [];
    var selfName = viewer ? trim((viewer.first || '') + ' ' + (viewer.last || '')) : '';
    var list = scope.ownGroups.map(function (group) {
      return {
        uid: group.uid,
        name: group.name,
        city: group.city,
        country: group.country,
        leaderUID: group.leaderUID,
        leaderName: selfName
      };
    });
    scope.subordinates.forEach(function (pastor) {
      var name = trim(pastor.first + ' ' + pastor.last);
      (pastor.groups || []).forEach(function (group) {
        list.push({
          uid: group.uid,
          name: group.name,
          city: group.city,
          country: group.country,
          leaderUID: pastor.uid,
          leaderName: name
        });
      });
    });
    return list;
  }

  function inactiveGroupsInScope(groups, checkinRows, cutoffIso) {
    var recent = {};
    (checkinRows || []).forEach(function (row) {
      var day = dateKey(row.date);
      var uid = trim(row.groupUID || row.uid);
      if (!uid || !day || day < cutoffIso) return;
      recent[uid] = true;
    });
    return (groups || []).filter(function (group) { return !recent[trim(group.uid)]; });
  }

  function groupChips(groups) {
    if (!groups.length) return '<span style="font-size:11px;color:var(--muted)">No active groups</span>';
    return groups.map(function (group) {
      var count = finiteNumber(group.checkinsThisWeek);
      return '<span class="hier-group-chip"><span class="ci-dot' + (count > 0 ? ' active' : '') + '"></span>' +
        escapeHtml(group.uid) + (group.name ? ' · ' + escapeHtml(group.name) : '') +
        (count > 0 ? ' <b style="color:#16a34a">(' + count + ')</b>' : '') + '</span>';
    }).join('');
  }

  function renderNetworkReport(data, viewer, checkinRows) {
    var scope = normalizeScopedHierarchy(data, viewer);
    if (!scope.ok) return '<div class="empty-state"><p>' + escapeHtml(scope.message) + '</p></div>';
    if (checkinRows) addViewerGroupsFromCheckins(scope, checkinRows, viewer && viewer.uid);
    var groupCount = scope.ownGroups.length;
    var checkins = 0;
    scope.ownGroups.forEach(function (group) { checkins += finiteNumber(group.checkinsThisWeek); });
    scope.subordinates.forEach(function (pastor) {
      groupCount += pastor.groups.length;
      pastor.groups.forEach(function (group) { checkins += finiteNumber(group.checkinsThisWeek); });
    });
    var supervisor = '';
    if (scope.hubPastor) {
      supervisor = '<div class="hier-section-label">Reports to</div>' +
        '<div class="current-hp-tag">🔗 ' + escapeHtml(trim(scope.hubPastor.first + ' ' + scope.hubPastor.last)) +
        ' (' + escapeHtml(scope.hubPastor.uid) + ')</div>';
    }
    var ownBlock = '<div class="hier-pp"><div class="hier-pp-name">Your groups</div>' +
      '<div class="hier-pp-meta">' + scope.ownGroups.length + ' group' + (scope.ownGroups.length === 1 ? '' : 's') + '</div>' +
      '<div class="hier-groups">' + groupChips(scope.ownGroups) + '</div></div>';
    var pastorBlocks = scope.subordinates.map(function (pastor) {
      return '<div class="hier-pp"><div class="hier-pp-name">' + escapeHtml(trim(pastor.first + ' ' + pastor.last)) +
        ' <span style="font-weight:400;color:var(--muted)">' + escapeHtml(pastor.uid) + '</span></div>' +
        '<div class="hier-pp-meta">' + escapeHtml([pastor.city, pastor.country].filter(Boolean).join(', ')) +
        ' · ' + pastor.groups.length + ' group' + (pastor.groups.length === 1 ? '' : 's') + '</div>' +
        '<div class="hier-groups">' + groupChips(pastor.groups) + '</div></div>';
    }).join('');
    var pastorSection = scope.subordinates.length
      ? '<div class="hier-section-label">Leaders who report to you</div><div class="hier-pp-list">' + pastorBlocks + '</div>'
      : '';
    return '<div class="ar-summary-bar">' +
      '<div>Leaders reporting to you: <span>' + scope.subordinates.length + '</span></div>' +
      '<div>Active groups: <span>' + groupCount + '</span></div>' +
      '<div>Check-ins this week: <span style="color:#16a34a">' + checkins + '</span></div>' +
      '</div><div class="hier-scroll">' + supervisor + ownBlock + pastorSection + '</div>';
  }

  function renderInactiveReport(groups, cutoffIso) {
    if (!groups.length) {
      return '<div class="empty-state"><p>Every group in your network has a check-in on or after ' +
        escapeHtml(cutoffIso) + '.</p></div>';
    }
    var body = groups.map(function (group) {
      var where = [group.city, group.country].filter(Boolean).join(', ');
      return '<tr><td style="font-weight:700;color:var(--gold)">' + escapeHtml(group.uid) + '</td>' +
        '<td>' + escapeHtml(group.name || '—') + '</td>' +
        '<td style="font-size:12px;color:var(--muted)">' + escapeHtml(where || '—') + '</td>' +
        '<td style="font-size:12px">' + escapeHtml(group.leaderName || group.leaderUID || '—') + '</td>' +
        '<td style="font-size:12px;color:var(--muted)">' + escapeHtml(group.created || '—') + '</td></tr>';
    }).join('');
    return '<div style="font-size:12px;color:var(--muted);margin-bottom:10px">' + groups.length +
      ' group' + (groups.length === 1 ? '' : 's') + ' in your network with no check-in since ' +
      escapeHtml(cutoffIso) + '.</div>' +
      '<div class="report-table-wrap" style="max-height:420px"><table class="report-table"><thead><tr>' +
      '<th>Group ID</th><th>Name</th><th>Location</th><th>Leader</th><th>Created</th>' +
      '</tr></thead><tbody>' + body + '</tbody></table></div>';
  }

  return {
    isLeaderUid: isLeaderUid,
    isGroupActive: isGroupActive,
    isHubPastor: isHubPastor,
    supervisorUid: supervisorUid,
    normalizeHeader: normalizeHeader,
    resolveLeaderColumns: resolveLeaderColumns,
    resolveGroupColumns: resolveGroupColumns,
    resolveCheckinColumns: resolveCheckinColumns,
    groupsAuthorizedForLeader: groupsAuthorizedForLeader,
    presentNetwork: presentNetwork,
    buildLeaderReport: buildLeaderReport,
    publicCheckinRows: publicCheckinRows,
    summarizeCheckins: summarizeCheckins,
    checkinError: checkinError,
    escapeHtml: escapeHtml,
    localISODate: localISODate,
    defaultReportRange: defaultReportRange,
    cutoffDate: cutoffDate,
    toCsv: toCsv,
    renderCheckinReport: renderCheckinReport,
    normalizeScopedHierarchy: normalizeScopedHierarchy,
    addViewerGroupsFromCheckins: addViewerGroupsFromCheckins,
    groupsFromScope: groupsFromScope,
    inactiveGroupsInScope: inactiveGroupsInScope,
    renderNetworkReport: renderNetworkReport,
    renderInactiveReport: renderInactiveReport
  };
});
