(function () {
  'use strict';

  let app;
  let data;
  let error = '';
  let filter = '';
  let loading;
  let syncing = false;
  let pending = new Set();
  const syncKey = 'mandalart-mate-pending-social';
  const reactions = {heart: '💛', clap: '👏', fire: '🔥'};
  const reactionLabels = {heart: '마음', clap: '박수', fire: '응원'};
  const date = new Intl.DateTimeFormat('ko-KR', {month: 'long', day: 'numeric'});

  function active() {
    return Boolean(document.querySelector('.mates-page'));
  }

  function repaint() {
    if (active()) app.refresh();
  }

  async function request(route, payload) {
    const init = payload === undefined ? undefined : {
      method: 'PUT', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(payload)
    };
    const response = await fetch('./api/mates/' + route, init);
    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      const failure = new Error(result.error ?? '메이트 서버에 연결하지 못했어요.');
      failure.status = response.status;
      throw failure;
    }
    return result;
  }

  async function load(refresh = true) {
    if (loading) return loading;
    loading = request('state').then(state => {
      data = state;
      error = '';
      if (filter && !state.connections.some(friend => friend.code === filter && friend.status === 'accepted')) filter = '';
      return state;
    }).catch(reason => {
      error = reason.message;
      throw reason;
    }).finally(() => {
      loading = undefined;
      if (refresh) repaint();
    });
    return loading;
  }

  function avatar(name, index = 4) {
    return '<span class="mate-avatar" style="--friend-color:' + window.Mandalart.palettes[index][0] + '" aria-hidden="true">' +
      app.escape(Array.from(name.trim())[0] || 'M') + '</span>';
  }

  function button(action, label, code = '', extra = '') {
    return '<button type="button" class="button secondary" data-mates-action="' + action + '" data-mate-code="' +
      app.escape(code) + '"' + extra + '>' + label + '</button>';
  }

  function feedCard(post) {
    const color = window.Mandalart.palettes[post.tint][0];
    const source = './api/mates/photo?code=' + encodeURIComponent(post.code) + '&id=' + encodeURIComponent(post.id) +
      '&v=' + encodeURIComponent(post.updatedAt);
    const picture = post.hasPhoto ? '<img class="mate-photo" src="' + source + '" alt="' + app.escape(post.title) + ' 사진" loading="lazy">' : '';
    const reactionButtons = Object.entries(reactions).map(([reaction, symbol]) =>
      '<button type="button" class="mate-reaction" data-mates-action="cheer" data-mate-code="' + post.code +
      '" data-goal-id="' + post.id + '" data-reaction="' + reaction + '" aria-pressed="' + (post.cheer === reaction) +
      '" aria-label="' + reactionLabels[reaction] + '">' + symbol + '</button>').join('');
    return '<article class="mate-post"><div class="mate-post-head">' + avatar(post.name, post.tint) +
      '<div><strong>' + app.escape(post.name) + '</strong><p>' + date.format(new Date(post.doneAt || post.updatedAt)) + '</p></div>' +
      '<span class="mate-status" style="--friend-color:' + color + '">' + (post.doneAt ? app.icon('check') + '완료' : '진행 중') +
      '</span></div><h2>' + app.escape(post.title) + '</h2><p class="mate-post-area">' + app.escape(post.area) + '</p>' +
      picture + '<div class="mate-reactions" role="group" aria-label="응원 보내기">' + reactionButtons + '</div></article>';
  }

  function render() {
    const heading = '<div class="mate-heading"><h1>메이트</h1>' +
      (data ? button('invite', app.icon('plus') + '메이트 추가') : '') + '</div>';
    if (!data) {
      const prompt = error ? '<div class="panel"><p class="empty-note">' + app.escape(error) + '</p>' +
        button('retry', '다시 불러오기') + '</div>' : '<p class="panel empty-note" aria-live="polite">메이트를 불러오는 중이에요.</p>';
      return '<section class="mates-page">' + heading + prompt + '</section>';
    }
    const accepted = data.connections.filter(friend => friend.status === 'accepted');
    const pendingRequests = data.connections.filter(friend => friend.status === 'pending');
    const friends = accepted.map(friend => '<button type="button" class="mate-filter" data-mates-action="filter" data-mate-code="' +
      friend.code + '" aria-pressed="' + (filter === friend.code) + '">' + avatar(friend.name) + '<span>' +
      app.escape(friend.name) + '</span></button>').join('');
    const requests = pendingRequests.map(friend => '<div class="mate-request">' + avatar(friend.name) + '<strong>' +
      app.escape(friend.name) + '</strong>' + (friend.outgoing ? '<span class="mate-muted">응답 대기</span>' :
        button('accept', '수락', friend.code) + button('decline', '거절', friend.code)) + '</div>').join('');
    const current = accepted.find(friend => friend.code === filter);
    const posts = data.posts.filter(post => !filter || post.code === filter);
    const received = (data.received ?? []).filter(item => !filter || item.code === filter);
    const thanks = received.slice(0, 4).map(item => '<div class="mate-thanks-row">' +
      reactions[item.cheer] + ' <strong>' + app.escape(item.name) + '</strong> · ' + app.escape(item.title) + '</div>').join('');
    return '<section class="mates-page">' + heading + '<div class="mate-profile">' + avatar(data.profile.name) +
      '<div><strong>' + app.escape(data.profile.name) + '</strong><small>메이트 ' + accepted.length + '명</small></div>' +
      '<button type="button" class="icon-button" data-mates-action="name" aria-label="내 닉네임 편집">' + app.icon('edit') + '</button></div>' +
      (requests ? '<section class="mate-requests"><h2>연결 요청</h2>' + requests + '</section>' : '') +
      (friends ? '<div class="mate-filters" role="group" aria-label="메이트별 소식"><button class="mate-filter" type="button" data-mates-action="filter" data-mate-code="" aria-pressed="' + (!filter) +
        '"><span class="mate-avatar all-mates">' + app.icon('people') + '</span><span>모두</span></button>' + friends + '</div>' : '') +
      '<div class="mate-feed-heading"><h2>' + (current ? app.escape(current.name) + '님의 목표' : '메이트 소식') + '</h2>' +
      (accepted.length ? button('sharing', '목표 공개', filter) : '') + '</div>' +
      (thanks ? '<section class="mate-thanks"><h2>받은 응원</h2>' + thanks + '</section>' : '') +
      (posts.length ? '<div class="mate-feed">' + posts.map(feedCard).join('') + '</div>' :
        '<div class="panel"><p class="empty-note">' + (accepted.length ? '메이트가 공개한 목표가 여기에 보여요.' :
          '메이트를 추가하면 서로 고른 목표와 사진을 보고 응원할 수 있어요.') + '</p></div>') + '</section>';
  }

  function inviteDialog(prefill = '') {
    const invite = new URL(location.pathname, location.origin);
    invite.searchParams.set('mate', data.profile.code);
    invite.hash = 'mates';
    app.dialog('메이트 추가', '친구에게 내 링크를 보내거나 받은 코드를 입력하세요.',
      '<div class="mate-code-box"><span><small>내 코드</small><strong>' + data.profile.code + '</strong></span>' +
      button('copy', '초대 링크 복사') + '</div><form id="mate-invite-form">' +
      '<label class="field">친구 코드<input name="code" maxlength="30" autocapitalize="characters" spellcheck="false" value="' +
      app.escape(prefill) + '" required></label><p class="form-error" id="mate-dialog-error" role="alert"></p>' +
      '<button type="submit" class="button primary mate-wide">연결 요청 보내기</button></form>');
    const form = document.getElementById('mate-invite-form');
    form.addEventListener('submit', event => {
      event.preventDefault();
      const code = form.elements.code.value.trim().replace(/^MT[- ]?/i, '').replaceAll(' ', '').toUpperCase();
      submit(form, async () => {
        await request('request', {code});
        const current = new URL(location.href);
        current.searchParams.delete('mate');
        history.replaceState(history.state, '', current);
        app.close();
        app.toast('메이트 요청을 보냈어요.');
        await load();
      });
    });
    form.parentElement.querySelector('[data-mates-action="copy"]').dataset.invite = invite.href;
  }

  function nameDialog() {
    app.dialog('닉네임 편집', '', '<form id="mate-name-form"><label class="field">메이트에게 보이는 이름<input name="name" maxlength="20" required value="' +
      app.escape(data.profile.name) + '"></label><p class="form-error" id="mate-dialog-error" role="alert"></p>' +
      '<button type="submit" class="button primary mate-wide">저장</button></form>');
    const form = document.getElementById('mate-name-form');
    form.addEventListener('submit', event => {
      event.preventDefault();
      submit(form, async () => {
        await request('profile', {name: form.elements.name.value});
        app.close();
        await load();
      });
    });
  }

  async function submit(form, handler) {
    const control = form.querySelector('[type="submit"]');
    if (control.disabled) return;
    control.disabled = true;
    try {
      await handler();
    } catch (reason) {
      const message = document.getElementById('mate-dialog-error');
      if (message) message.textContent = reason.message;
      else app.toast(reason.message);
    } finally {
      control.disabled = false;
    }
  }

  function shareDialog(code = '') {
    const friends = data.connections.filter(friend => friend.status === 'accepted');
    if (!code && friends.length === 1) code = friends[0].code;
    if (!code) {
      app.dialog('공개할 메이트', '', '<div class="mate-picker">' + friends.map(friend =>
        button('sharing', avatar(friend.name) + app.escape(friend.name), friend.code)).join('') + '</div>');
      return;
    }
    const friend = friends.find(item => item.code === code);
    if (!friend) return;
    const choices = new Map(data.selected.filter(item => item.code === code).map(item => [item.id, item]));
    const goals = window.Mandalart.populatedGoals(app.board());
    const goalList = goals.map(entry => '<label class="check-line share-option"><input type="checkbox" name="goal" value="' +
      entry.id + '"' + (choices.has(entry.id) ? ' checked' : '') + '><span>' + app.escape(title(entry.goal)) +
      '</span><small>' + app.escape(app.label(entry)) + '</small></label>').join('');
    app.dialog(friend.name + '에게 공개', '체크한 목표가 이 메이트의 소식에 표시돼요.',
      '<form id="mate-share-form">' + (goalList ? '<div class="share-list">' + goalList + '</div>' :
        '<p class="dialog-copy">목표판에 목표를 만든 뒤 공개할 수 있어요.</p>') +
      '<label class="check-line"><input type="checkbox" name="photos"' + ([...choices.values()].some(item => item.allowPhoto) ? ' checked' : '') +
      '> 선택한 목표의 사진도 공개</label><p class="form-error" id="mate-dialog-error" role="alert"></p>' +
      '<div class="dialog-actions">' + button('unlink', '메이트 연결 해제', code) +
      '<button type="submit" class="button primary">공개 설정 저장</button></div></form>');
    const form = document.getElementById('mate-share-form');
    form.addEventListener('submit', event => {
      event.preventDefault();
      const on = new Set(new FormData(form).getAll('goal'));
      const posts = goals.filter(entry => on.has(entry.id));
      const allowPhoto = form.elements.photos.checked;
      submit(form, async () => {
        if (allowPhoto) {
          for (const entry of posts) {
            if (entry.goal.photo) await request('photo', {id: entry.id, data: entry.goal.photo});
          }
        }
        await request('sharing', {code, goals: posts.map(entry => ({...snapshot(entry, allowPhoto), allowPhoto}))});
        await load(false);
        app.close();
        repaint();
        app.toast('메이트 공개 설정을 저장했어요.');
      });
    });
  }

  function title(goal) { return goal.text || '사진 기록'; }

  function snapshot(entry, allowPhoto, board = app.board()) {
    const tint = entry.groupIndex === null ? 4 : window.Mandalart.groups[entry.groupIndex];
    const area = entry.kind === 'action' ? (board.goals[entry.groupIndex].main.text || '실행 목표') :
      entry.kind === 'core' ? '중심 목표' : '영역 목표';
    return {id: entry.id, title: title(entry.goal), area, tint, doneAt: entry.goal.doneAt, hasPhoto: allowPhoto && !!entry.goal.photo};
  }

  function persistPending() {
    try { localStorage.setItem(syncKey, JSON.stringify([...pending])); } catch {}
  }

  async function flush() {
    if (syncing || !pending.size) return;
    syncing = true;
    try {
      const current = data ?? await load(false);
      const sharing = new Map(current.selected.map(item => [item.id, false]));
      for (const item of current.selected) if (item.allowPhoto) sharing.set(item.id, true);
      while (pending.size) {
        const id = pending.values().next().value;
        pending.delete(id);
        try {
          if (sharing.has(id)) {
            const board = app.board();
            const entry = window.Mandalart.locate(board, id);
            if (window.Mandalart.filled(entry.goal)) {
              const allowPhoto = sharing.get(id);
              if (allowPhoto && entry.goal.photo) await request('photo', {id, data: entry.goal.photo});
              await request('goal', {goal: snapshot(entry, allowPhoto, board)});
            } else {
              await request('goal', {id});
            }
          }
        } catch (reason) {
          pending.add(id);
          throw reason;
        } finally {
          persistPending();
        }
      }
    } catch {
      // The same IDs are retried when the connection returns or the app next starts.
    } finally {
      syncing = false;
    }
  }

  function changed(previous, next) {
    const before = new Map(window.Mandalart.populatedGoals(previous).map(entry => [entry.id, entry]));
    const after = new Map(window.Mandalart.populatedGoals(next).map(entry => [entry.id, entry]));
    for (const id of new Set([...before.keys(), ...after.keys()])) {
      const old = before.get(id);
      const current = after.get(id);
      if (!old || !current || old.goal.photo !== current.goal.photo ||
          JSON.stringify(snapshot(old, true, previous)) !== JSON.stringify(snapshot(current, true, next))) pending.add(id);
    }
    persistPending();
    flush();
  }

  async function open() {
    try {
      await load();
      const invite = new URL(location.href).searchParams.get('mate');
      if (active() && /^[A-F0-9]{14}$/.test(invite ?? '') && !document.querySelector('dialog[open]')) inviteDialog(invite);
      flush();
    } catch {}
  }

  async function onClick(event) {
    const control = event.target.closest('[data-mates-action]');
    if (!control || control.disabled) return;
    if (control.dataset.matesAction === 'retry') {
      open();
      return;
    }
    if (!data) return;
    const action = control.dataset.matesAction;
    const code = control.dataset.mateCode;
    if (action === 'filter') {
      filter = code;
      repaint();
      document.querySelector('.mate-filter[data-mate-code="' + code + '"]')?.focus({preventScroll: true});
      return;
    }
    if (action === 'invite') return inviteDialog();
    if (action === 'sharing') return shareDialog(code);
    if (action === 'name') return nameDialog();
    if (action === 'copy') {
      try {
        await navigator.clipboard.writeText(control.dataset.invite);
        app.toast('메이트 초대 링크를 복사했어요.');
      } catch {
        const field = document.createElement('input');
        field.value = control.dataset.invite;
        field.readOnly = true;
        field.setAttribute('aria-label', '메이트 초대 링크');
        control.closest('.mate-code-box').after(field);
        field.focus();
        field.select();
      }
      return;
    }
    if (action === 'unlink') {
      app.dialog('메이트 연결 해제', '연결을 끊으면 서로 공개한 목표와 사진이 소식에서 사라져요.',
        '<div class="dialog-actions">' + button('sharing', '취소', code) + button('remove', '연결 해제', code) + '</div>');
      return;
    }
    control.disabled = true;
    try {
      if (action === 'cheer') {
        const cheer = control.getAttribute('aria-pressed') === 'true' ? null : control.dataset.reaction;
        await request('cheer', {code, id: control.dataset.goalId, cheer});
        if (cheer) app.toast('응원을 보냈어요.');
      } else if (action === 'remove') {
        await request('remove', {code});
        app.close();
      } else if (action === 'accept' || action === 'decline') {
        await request('respond', {code, accept: action === 'accept'});
      }
      await load();
    } catch (reason) {
      app.toast(reason.message);
    } finally {
      control.disabled = false;
    }
  }

  function configure(callbacks) {
    app = callbacks;
    try {
      pending = new Set(JSON.parse(localStorage.getItem(syncKey) ?? '[]'));
    } catch {}
    document.addEventListener('click', onClick);
    window.addEventListener('online', flush);
    window.addEventListener('focus', () => { if (active()) open(); });
    flush();
  }

  window.Mates = {configure, changed, render, open};
})();
