import { TRANSLATIONS, EXTRA_TRANSLATIONS, SCENARIOS, PRACTICE_TEXT, PROGRAM_TRANSLATIONS, FREE_PROGRAM_DAYS, HEALTH_TRANSLATIONS, SUPPORTED_LANGS, LANG_LABELS } from './i18n.js';
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth, GoogleAuthProvider, signInWithPopup, reauthenticateWithPopup, onAuthStateChanged, signOut, deleteUser, setPersistence, browserLocalPersistence } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore, doc, getDoc, setDoc, collection, addDoc, onSnapshot, query, orderBy, limit, serverTimestamp, deleteDoc, deleteField, updateDoc, getDocs, where, collectionGroup, arrayUnion, arrayRemove, runTransaction, increment } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { getStorage, ref as storageRef, uploadBytes, getBlob, deleteObject } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-storage.js";

const firebaseConfig = {
  apiKey: "AIzaSyA0qezCgiRp-ii8aaIiGfeRlls8PyEckLI",
  authDomain: "otklik-1.firebaseapp.com",
  projectId: "otklik-1",
  storageBucket: "otklik-1.firebasestorage.app",
  messagingSenderId: "76811353674",
  appId: "1:76811353674:web:1669efc4014509385430b3"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
setPersistence(auth, browserLocalPersistence).catch(console.error);
const db = getFirestore(app);
const storage = getStorage(app);

try { if (localStorage.getItem('otklik_has_account') === '1') document.getElementById('authScreen').classList.add('hidden'); } catch(e){}

const safeSession = (() => {
  try { const ss = window.sessionStorage; ss.setItem('__t','1'); ss.removeItem('__t'); return { get:k=>ss.getItem(k), set:(k,v)=>ss.setItem(k,v), remove:k=>ss.removeItem(k) }; }
  catch(e){ const m={}; return { get:k=>m[k]||null, set:(k,v)=>{m[k]=v}, remove:k=>{delete m[k]} }; }
})();

let currentUser = null, userData = null;
let unsubscribeSessions = null, unsubscribeCommunity = null, unsubscribeSupport = null, unsubscribeUserProfile = null;
let deleteTimer = null, isAdmin = false, adminTargetUid = null, unsubAdminChat = null;
let lastPitchAggregateAt = 0;
let pitchDifferenceBuffer = null, pitchNormalizedBuffer = null, audioLoopTimer = null;
let lastSessionsCache = [];
let supportMessages = [];
let supportChatOpen = false, supportFirstRender = true, lastSeenSupportTime = 0, replyingTo = null;
let adminReplyingTo = null;

const $ = (s) => document.querySelector(s);
const $$ = (s) => [...document.querySelectorAll(s)];

const THEMES = ['sage','lavender','warm','milky'];
const PALETTES = ['sage','lavender','warm','milky'];
const THEME_BG = { sage:'#f5f6f4', lavender:'#FCFBFF', warm:'#FFFAF5', milky:'#F7F7F5' };







const detectedLang = (navigator.language || 'ru').split('-')[0].toLowerCase();
let currentLang = localStorage.getItem('otklik_lang') || (SUPPORTED_LANGS.includes(detectedLang) ? detectedLang : 'ru');
if (!SUPPORTED_LANGS.includes(currentLang)) currentLang = 'ru';

function t(key, vars) {
  const dict = TRANSLATIONS[currentLang] || TRANSLATIONS.ru;
  const fallbackTranslations = {
    'mode.neutral': {ru:'Нейтральность',en:'Neutral',es:'Neutralidad',pt:'Neutralidade',fr:'Neutralité',de:'Neutralität',th:'เป็นกลาง',id:'Netral',tl:'Neutral'},
    'mode.femHint': {ru:'Мягко исследуй высоту и лёгкость звучания — без усилия и сравнения.',en:'Explore pitch and lightness gently, without strain or comparison.',es:'Explora suavemente la altura y ligereza, sin forzar ni compararte.',pt:'Explore suavemente a altura e a leveza, sem forçar nem comparar.',fr:'Explore doucement la hauteur et la légèreté, sans forcer ni te comparer.',de:'Erkunde Tonhöhe und Leichtigkeit sanft, ohne Druck oder Vergleich.',th:'ลองสำรวจระดับเสียงและความเบาอย่างผ่อนคลาย ไม่ฝืนตัวเอง',id:'Jelajahi nada dan kelembutan suara dengan santai, tanpa memaksakan diri.',tl:'Dahan-dahang tuklasin ang taas at gaan ng boses nang walang pilit.'},
    'mode.mascHint': {ru:'Ищи устойчивое и комфортное звучание, сохраняя свободное дыхание.',en:'Find a steady, comfortable sound while keeping your breath free.',es:'Busca un sonido estable y cómodo, manteniendo la respiración libre.',pt:'Encontre um som estável e confortável, mantendo a respiração livre.',fr:'Cherche un son stable et confortable en gardant une respiration libre.',de:'Finde einen stabilen, angenehmen Klang und lass deinen Atem frei.',th:'ค้นหาเสียงที่มั่นคงและสบาย พร้อมหายใจอย่างเป็นธรรมชาติ',id:'Temukan suara yang stabil dan nyaman sambil menjaga napas tetap bebas.',tl:'Hanapin ang matatag at komportableng tunog habang malayang humihinga.'},
    'mode.neutralHint': {ru:'Исследуй сбалансированное звучание, которое ощущается естественным именно тебе.',en:'Explore a balanced sound that feels natural to you.',es:'Explora un sonido equilibrado que se sienta natural para ti.',pt:'Explore um som equilibrado que pareça natural para você.',fr:'Explore un son équilibré qui te semble naturel.',de:'Erkunde einen ausgewogenen Klang, der sich für dich natürlich anfühlt.',th:'สำรวจเสียงที่สมดุลและเป็นธรรมชาติสำหรับคุณ',id:'Jelajahi suara seimbang yang terasa alami bagimu.',tl:'Tuklasin ang balanseng tunog na natural para sa iyo.'}
  };
  let str = dict[key] ?? EXTRA_TRANSLATIONS[currentLang]?.[key] ?? TRANSLATIONS.en[key] ?? EXTRA_TRANSLATIONS.en?.[key] ?? TRANSLATIONS.ru[key] ?? EXTRA_TRANSLATIONS.ru?.[key] ?? fallbackTranslations[key]?.[currentLang] ?? key;
  if (vars) Object.keys(vars).forEach(k => { str = str.replace(new RegExp('\\{'+k+'\\}','g'), vars[k]); });
  return str;
}

function getTimeGreetingKey() {
  const h = new Date().getHours();
  if (h >= 5 && h < 12) return 'greeting.morning';
  if (h >= 12 && h < 18) return 'greeting.afternoon';
  if (h >= 18 && h < 23) return 'greeting.evening';
  return 'greeting.night';
}

function updateHeaderSubtitle(animate = true) {
  const el = document.getElementById('headerSubtitle');
  if (!el) return;
  const newText = t(getTimeGreetingKey());
  if (el.textContent === newText) return;
  if (animate) {
    el.classList.add('fading');
    clearTimeout(el._fadeTimer);
    el._fadeTimer = setTimeout(() => {
      el.textContent = newText;
      el.classList.remove('fading');
    }, 220);
  } else {
    el.textContent = newText;
  }
}

function applyTranslations() {
  updateModeHint();
  document.querySelectorAll('[data-i18n]').forEach(el => {
    const key = el.dataset.i18n;
    const txt = t(key);
    if (key === 'theme.label') el.textContent = ({ru:'Оформление',en:'Appearance',es:'Apariencia',pt:'Aparência',fr:'Apparence',de:'Design',th:'ธีม',id:'Tampilan',tl:'Hitsura'})[currentLang] || 'Appearance';
    else if (el.id === 'micBtn') el.textContent = running ? t('mic.finish') : t('mic.start');
    else if (txt) el.textContent = txt;
  });
  document.querySelectorAll('[data-i18n-placeholder]').forEach(el => {
    el.placeholder = t(el.dataset.i18nPlaceholder);
  });
  document.querySelectorAll('[data-i18n-title]').forEach(el => {
    el.title = t(el.dataset.i18nTitle);
  });
  const lbl = $('#langSelectLabel');
  if (lbl) lbl.textContent = LANG_LABELS[currentLang] || currentLang;
  document.querySelectorAll('#langSelectPanel button').forEach(b => b.classList.toggle('active', b.dataset.lang === currentLang));
  document.querySelectorAll('.ctrl-btn').forEach(el => el.setAttribute('aria-label', t('common.close')));
  $('#closeStreakLossBtn')?.setAttribute('aria-label', t('common.close'));
  updateHeaderSubtitle(false);
  if (userData) {
    if (currentScenarioKey === null && !userEditedPractice) setPracticeText(true);
    renderPrograms();
    if (lastSessionsCache) renderRecent(lastSessionsCache);
    updateStreakCard();
    updateHrtWidget();
    if (activeMode) $('#targetLegend').textContent = `${targetLow}–${targetHigh} ${currentLang === 'ru' ? 'Гц' : 'Hz'}`;
    updateZoneLegendSwatches();
  }
  if (currentScenarioKey !== null) setPracticeText(true);
  if ($('#scenariosModal')?.classList.contains('open')) {
    renderScenarios();
    renderCustomTexts();
  }
}

function applyLang(lang) {
  if (!SUPPORTED_LANGS.includes(lang)) lang = 'ru';
  currentLang = lang;
  localStorage.setItem('otklik_lang', lang);
  document.documentElement.lang = lang;
  applyTranslations();
  document.title = t('app.title') || (lang === 'ru' ? 'Отклик — пространство твоего голоса' : 'Otklik — your voice space');
}

window.openModal = (id) => { document.getElementById(id)?.removeAttribute('aria-hidden'); document.getElementById(id).classList.add('open'); document.body.style.overflow = 'hidden'; };
window.closeModal = (id) => { document.getElementById(id).classList.remove('open'); document.getElementById(id)?.setAttribute('aria-hidden','true'); if (id === 'voiceTiredModal' && typeof clearBreathingExercise === 'function') clearBreathingExercise(); if(!document.querySelector('.modal.open')) document.body.style.overflow = ''; if (id === 'supportModal') { supportChatOpen = false; updateUnreadIndicator(); } };

const legacySavedTheme = localStorage.getItem('theme') || (window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'sage');
let activePalette = localStorage.getItem('otklik_palette') || (legacySavedTheme === 'dark' ? (localStorage.getItem('otklik_last_light_theme') || 'sage') : legacySavedTheme);
if (!PALETTES.includes(activePalette)) activePalette = 'sage';
let darkModeEnabled = localStorage.getItem('otklik_dark_mode') === null ? legacySavedTheme === 'dark' : localStorage.getItem('otklik_dark_mode') === '1';
document.documentElement.dataset.theme = activePalette;
document.documentElement.dataset.mode = darkModeEnabled ? 'dark' : 'light';
function updateThemeIcon() { const btn = $('#themeToggle'); if (btn) btn.textContent = darkModeEnabled ? '☀️' : '🌙'; }
function updateThemeSelection() {
  $$('.theme-opt').forEach(b => b.classList.toggle('selected', b.dataset.theme === activePalette));
}
updateThemeIcon();
updateThemeSelection();
let themeSaveTimer = null;
function persistThemeDebounced() {
  clearTimeout(themeSaveTimer);
  themeSaveTimer = setTimeout(() => {
    if (!currentUser || !userData) return;
    userData.theme = darkModeEnabled ? 'dark' : activePalette;
    userData.palette = activePalette;
    userData.darkMode = darkModeEnabled;
    updateDoc(doc(db, 'users', currentUser.uid), { theme: userData.theme, palette: activePalette, darkMode: darkModeEnabled }).catch(() => {});
  }, 500);
}
function applyTheme(theme, modeOverride = null) {
  if (!THEMES.includes(theme)) theme = 'sage';
  if (theme === 'dark') { darkModeEnabled = true; }
  else { activePalette = theme; if (modeOverride !== null) darkModeEnabled = !!modeOverride; }
  document.body.classList.add('theme-anim');
  document.documentElement.dataset.theme = activePalette;
  document.documentElement.dataset.mode = darkModeEnabled ? 'dark' : 'light';
  const background = darkModeEnabled ? '#141414' : (THEME_BG[activePalette] || '#f5f6f4');
  document.documentElement.style.background = background;
  const themeMeta = document.querySelector('meta[name="theme-color"]'); if (themeMeta) themeMeta.content = background;
  const appleStatus = document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]'); if (appleStatus) appleStatus.content = darkModeEnabled ? 'black-translucent' : 'default';
  localStorage.setItem('theme', darkModeEnabled ? 'dark' : activePalette);
  localStorage.setItem('otklik_palette', activePalette);
  localStorage.setItem('otklik_dark_mode', darkModeEnabled ? '1' : '0');
  localStorage.setItem('otklik_last_light_theme', activePalette);
  updateThemeIcon();
  updateThemeSelection();
  clearTimeout(applyTheme._t);
  drawGraph();
  applyTheme._t = setTimeout(() => document.body.classList.remove('theme-anim'), 400);
}
$('#themeToggle')?.addEventListener('click', () => { applyTheme(activePalette, !darkModeEnabled); persistThemeDebounced(); });
document.addEventListener('click', (event) => {
  const paletteButton = event.target.closest('.theme-opt[data-theme]');
  if (!paletteButton) return;
  const selectedTheme = paletteButton.dataset.theme;
  applyTheme(selectedTheme, darkModeEnabled);
  persistThemeDebounced();
});

$$('[data-close]').forEach(b => b.addEventListener('click', () => closeModal(b.dataset.close)));
$$('.modal').forEach(m => {
  m.addEventListener('click', (e) => {
    if (e.target !== m) return;
    if (m.id === 'deleteAccountModal') { cancelDelete(); return; }
    if (m.id === 'onboardingModal' || m.id === 'resultModal') return;
    closeModal(m.id);
  });
});

function showToast(msg) {
  const t_el = $('#toast'); t_el.textContent = msg; t_el.classList.add('show');
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => t_el.classList.remove('show'), 3000);
}

function navigate(target) {
  $$('.page').forEach(p => p.classList.toggle('active', p.id === `page-${target}`));
  $$('[data-nav]').forEach(b => b.classList.toggle('active', b.dataset.nav === target));
  window.scrollTo({ top: 0, behavior: 'smooth' });
}
$$('[data-nav]').forEach(b => b.addEventListener('click', () => navigate(b.dataset.nav)));
$$('[data-go]').forEach(b => b.addEventListener('click', () => navigate(b.dataset.go)));

window.addEventListener('scroll', () => { const btn = $('#scrollTopBtn'); if (btn) btn.classList.toggle('show', window.scrollY > 320); }, { passive: true });
$('#scrollTopBtn')?.addEventListener('click', () => { window.scrollTo({ top: 0, behavior: 'smooth' }); });

const coinInfoBtn = document.getElementById('coinInfoBtn');
if (coinInfoBtn) {
  coinInfoBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const wrap = coinInfoBtn.closest('.coin-label-line');
    if (wrap) wrap.classList.toggle('tooltip-open');
  });
  document.addEventListener('click', (e) => {
    const wrap = coinInfoBtn.closest('.coin-label-line');
    if (wrap && !wrap.contains(e.target)) wrap.classList.remove('tooltip-open');
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') coinInfoBtn.closest('.coin-label-line')?.classList.remove('tooltip-open');
  });
}

const voiceAgencyDetails = document.getElementById('voiceAgencyDetails');
const voiceAgencyBtn = voiceAgencyDetails?.querySelector('.voice-agency-details-btn');
if (voiceAgencyBtn) {
  voiceAgencyBtn.addEventListener('click', () => {
    const isOpen = voiceAgencyDetails.classList.toggle('open');
    voiceAgencyBtn.setAttribute('aria-expanded', String(isOpen));
  });
}


const splashScreen = $('#splashScreen');

function showSplashWelcome() { splashScreen.classList.remove('show', 'fade-out'); }
function hideSplash() { splashScreen.classList.remove('show', 'fade-out'); }


$('#googleLoginBtn')?.addEventListener('click', async () => {
  const provider = new GoogleAuthProvider();
  try { await signInWithPopup(auth, provider); } catch (e) { showToast(t('toast.error') + ': ' + e.message); }
});

onAuthStateChanged(auth, async (user) => {
  if (user) {
    currentUser = user;
    isAdmin = (user.email === 'theboyslikeit.ru@gmail.com' && user.emailVerified === true);
    if (isAdmin) setupAdminIndicator();
    const adminSection = $('#adminSection');
    if (adminSection) adminSection.style.display = isAdmin ? 'block' : 'none';
    try { localStorage.setItem('otklik_has_account', '1'); } catch(e){}
    const authScreen = $('#authScreen');
    if (authScreen) { authScreen.classList.remove('auth-pending'); authScreen.classList.add('hidden'); }
    const docSnap = await getDoc(doc(db, 'users', user.uid));
    if (docSnap.exists() && docSnap.data().onboardingCompleted) {
      userData = docSnap.data();
      if (userData.lang && SUPPORTED_LANGS.includes(userData.lang)) { currentLang = userData.lang; localStorage.setItem('otklik_lang', userData.lang); }
      if (userData.theme && (THEMES.includes(userData.theme) || userData.theme === 'dark')) {
        activePalette = userData.palette || (userData.theme === 'dark' ? 'sage' : userData.theme);
        darkModeEnabled = typeof userData.darkMode === 'boolean' ? userData.darkMode : userData.theme === 'dark';
        applyTheme(darkModeEnabled ? 'dark' : activePalette);
      }
      applyTranslations();
      showSplashWelcome(); initAppUI(); showWelcomeSupport();
    } else {
      showSplashWelcome();
      setTimeout(() => { $('#onboardingModal').classList.add('open'); $$('#onbThemeGrid .theme-opt').forEach(b => b.classList.toggle('selected', b.dataset.theme === onbTheme)); if(!$('#onbUsername').value) { $('#onbUsername').value = 'user_' + Math.random().toString(36).substring(2, 7); checkUsernameAvailability($('#onbUsername').value); } }, 150);
    }
  } else {
    if (currentUser?.uid) sessionStorage.removeItem(`otklik_hide_agency_${currentUser.uid}`);
    currentUser = null; userData = null; isAdmin = false; lastSessionsCache = []; supportMessages = []; pendingSession = null; pitchHistory = []; smoothPitch = null; splashScreen.classList.remove('show', 'fade-out');
    try { localStorage.removeItem('otklik_has_account'); } catch(e){}
    $('#authScreen').classList.remove('auth-pending', 'hidden');
    $('#mainApp').classList.remove('ready');
    $('#bottomNav').style.display = 'none';
    safeSession.remove('otklik_unlocked');
    if (unsubscribeSessions) unsubscribeSessions();
    if (unsubscribeCommunity) unsubscribeCommunity();
    if (unsubscribeSupport) unsubscribeSupport();
    if (unsubscribeUserProfile) { unsubscribeUserProfile(); unsubscribeUserProfile = null; }
    if (unsubAdminChat) { unsubAdminChat(); unsubAdminChat = null; }
    if (adminUnsub) { adminUnsub(); adminUnsub = null; }
  }
});

let onbGoal = 'neutral', onbIdentity = 'prefer_not_to_say', onbTheme = activePalette || 'sage';
let onbAvatar = '🦊';
let usernameCheckTimer = null, usernameCheckSequence = 0;
function setUsernameStatus(message, state = '') {
  const status = $('#usernameStatus');
  const input = $('#onbUsername');
  if (!status || !input) return;
  status.textContent = message || '';
  status.classList.toggle('error', state === 'error');
  status.classList.toggle('success', state === 'success');
  input.classList.toggle('invalid', state === 'error');
  input.setAttribute('aria-invalid', state === 'error' ? 'true' : 'false');
}
async function checkUsernameAvailability(value) {
  const uname = String(value || '').trim().toLowerCase();
  const sequence = ++usernameCheckSequence;
  if (!uname) { setUsernameStatus(''); return false; }
  if (uname.length < 3) { setUsernameStatus(t('toast.usernameShort'), 'error'); return false; }
  setUsernameStatus(currentLang === 'ru' ? 'Проверяем доступность ID…' : 'Checking ID availability…');
  try {
    const snap = await getDoc(doc(db, 'usernames', uname));
    if (sequence !== usernameCheckSequence) return false;
    if (snap.exists() && snap.data()?.uid !== currentUser?.uid) {
      setUsernameStatus(currentLang === 'ru' ? 'Этот ID уже занят. Выбери другой.' : 'This ID is already taken. Choose another.', 'error');
      return false;
    }
    setUsernameStatus(currentLang === 'ru' ? 'ID свободен' : 'ID is available', 'success');
    return true;
  } catch (error) {
    if (sequence === usernameCheckSequence) setUsernameStatus(currentLang === 'ru' ? 'Не удалось проверить ID. Повтори перед регистрацией.' : 'Could not check this ID. Try again before registering.', 'error');
    return false;
  }
}
$('#onbUsername')?.addEventListener('input', function() {
  this.value = this.value.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
  clearTimeout(usernameCheckTimer);
  const value = this.value;
  if (!value) { setUsernameStatus(''); return; }
  if (value.length < 3) { setUsernameStatus(t('toast.usernameShort'), 'error'); return; }
  setUsernameStatus('');
  usernameCheckTimer = setTimeout(() => checkUsernameAvailability(value), 350);
});
$('#onbUsername')?.addEventListener('blur', () => {
  clearTimeout(usernameCheckTimer);
  const value = $('#onbUsername').value.trim();
  if (value.length >= 3) checkUsernameAvailability(value);
});
$('#onbThemeGrid')?.addEventListener('click', (e) => {
  const btn = e.target.closest('.theme-opt[data-theme]'); if (!btn) return;
  onbTheme = btn.dataset.theme;
  $$('#onbThemeGrid .theme-opt').forEach(b => b.classList.toggle('selected', b === btn));
  applyTheme(onbTheme, darkModeEnabled);
});
$('#avatarGrid')?.addEventListener('click', (e) => {
  const btn = e.target.closest('.avatar-opt'); if (!btn) return;
  $$('#avatarGrid .avatar-opt').forEach(b => b.classList.remove('selected'));
  btn.classList.add('selected'); onbAvatar = btn.dataset.val;
});
$('#avatarGrid').querySelector('.avatar-opt').classList.add('selected');

$('#onbFinish')?.addEventListener('click', async () => {
  const nick = $('#onbNickname').value.trim();
  const uname = $('#onbUsername').value.trim().toLowerCase();
  if (!nick || !uname) { showToast(t('toast.fillRequired')); return; }
  if (uname.length < 3) { setUsernameStatus(t('toast.usernameShort'), 'error'); showToast(t('toast.usernameShort')); return; }
  if (!currentUser) { showToast(t('toast.error')); return; }
  const btn = $('#onbFinish'); btn.disabled = true; btn.textContent = '...';
  try {
    const usernameDocRef = doc(db, 'usernames', uname);
    const userDocRef = doc(db, 'users', currentUser.uid);
    const nextUserData = {
      email: currentUser.email,
      goal: onbGoal,
      identity: onbIdentity,
      lang: currentLang,
      theme: darkModeEnabled ? 'dark' : onbTheme,
      palette: onbTheme,
      darkMode: darkModeEnabled,
      profile: { nickname: nick, username: uname, avatar: onbAvatar },
      onboardingCompleted: true,
      createdAt: serverTimestamp(),
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC',
      streak: 0,
      lastPracticeDate: null,
      coins: 300,
      sessionCount: 0,
      streakBroken: null
    };
    await runTransaction(db, async (transaction) => {
      const existing = await transaction.get(usernameDocRef);
      if (existing.exists() && existing.data()?.uid !== currentUser.uid) {
        const error = new Error('USERNAME_TAKEN');
        error.code = 'USERNAME_TAKEN';
        throw error;
      }
      transaction.set(userDocRef, nextUserData, { merge: true });
      transaction.set(usernameDocRef, { uid: currentUser.uid });
    });
    userData = { ...(userData || {}), ...nextUserData };
    applyTheme(onbTheme, darkModeEnabled);
    confetti({ particleCount: 160, spread: 80, origin: { y: 0.6 }, colors: ['#4A7C59', '#9C89B8', '#22C55E', '#8AB09A'] });
    setTimeout(() => { closeModal('onboardingModal'); initAppUI(); showToast(t('toast.welcome')); setTimeout(showWelcomeSupport, 400); }, 650);
  } catch (e) {
    if (e?.code === 'USERNAME_TAKEN' || e?.message === 'USERNAME_TAKEN') {
      setUsernameStatus(currentLang === 'ru' ? 'Этот ID уже занят. Выбери другой.' : 'This ID is already taken. Choose another.', 'error');
      showToast(t('toast.usernameTaken'));
    } else {
      showToast(t('toast.error') + ': ' + (e?.message || e));
    }
    btn.disabled = false; btn.textContent = t('common.finish');
  }
});

const MODES = { fem: { low: 165, high: 270, icon: '✿' }, masc: { low: 85, high: 145, icon: '◈' }, neutral: { low: 145, high: 185, icon: '◇' } };




let activeMode = 'fem', targetLow = MODES.fem.low, targetHigh = MODES.fem.high, showZones = true, showTarget = true;
let lineThickness = 2.5, lineColor = '#4A7C59';
let zoneColors = { male: '#6495ED', andro: '#ffffff', female: '#ffa0be', target: '#22C55E' };
let zoneVisibility = { male: 1, andro: 1, female: 1, target: 1 };
let zoneVisible = { male: true, andro: true, female: true, target: true };
let waterReminderEnabled = false, waterInterval = 15, restReminderEnabled = false, restInterval = 20, waterTimer = null, restTimer = null;
let scaleMin = 50, scaleMax = 450, graphScaleSpan = 400, graphScaleOffset = 0, graphScaleDrag = null, graphPanDrag = null, graphResponse = localStorage.getItem("graphResponse") || "sharp";

let audioCtx=null, stream=null, analyser=null, freqData=null, sourceNode=null, monitorGain=null, audioBuffer=null, lastAudioProcessAt=0, lastAudioResumeAttemptAt=0;
let running=false, isStarting=false, isStopping=false, rafId=0, smoothPitch=null, lastValidAt=0, lastFrameAt=0, session=null, pendingSession=null;
let rawPitchBuffer = [];
let lastStrainWarningAt = 0, lastDetectedHz = null, strainWarningTimer = null, breathingTimer = null, breathingElapsed = 0;
const MEDIAN_WINDOW = 5;
let audioMaxTimer = null, installPromptEvent = null;
let canvas=$('#voiceCanvas'), canvasCtx=canvas.getContext('2d'), graphStyle = 'line';
const HISTORY_WINDOW_MS = 24000, SAMPLE_INTERVAL_MS = 50, MAX_HISTORY_POINTS = Math.ceil(HISTORY_WINDOW_MS / SAMPLE_INTERVAL_MS) + 50;
const SESSION_MAX_SEC = 1800;
const AUDIO_MAX_SEC = 120;
let pitchHistory = [], lastDisplaySample = 0, LABEL_WIDTH = 58;
let _resultAudio = null, isSavingSession = false;

let sessionRecorder = null, sessionChunks = [];
let recordingEncodePromise = null;

const PROGRAMS = [
  { id: 'intro7', free: true, icon: '🌱', titleKey: 'prog.intro7.title', descKey: 'prog.intro7.desc', metaKey: 'prog.intro7.meta' },
  { id: 'fem30', premium: true, icon: '✿', titleKey: 'prog.fem30.title', descKey: 'prog.fem30.desc', metaKey: 'prog.fem30.meta' },
  { id: 'mascRes', premium: true, icon: '◈', titleKey: 'prog.mascRes.title', descKey: 'prog.mascRes.desc', metaKey: 'prog.mascRes.meta' },
  { id: 'tremor', premium: true, icon: '〰', titleKey: 'prog.tremor.title', descKey: 'prog.tremor.desc', metaKey: 'prog.tremor.meta' },
];







const COIN_SHOP_ITEMS = [
  { id: 'freeze', icon: '🧊', nameKey: 'coinShop.freeze.name', descKey: 'coinShop.freeze.desc', price: 100, max: 1, field: 'freezeCount' },
  { id: 'extraSessions', icon: '🗂', nameKey: 'coinShop.extraSessions.name', descKey: 'coinShop.extraSessions.desc', price: 100, max: 2, field: 'extraSessionsBought' },
  { id: 'extraText', icon: '📝', nameKey: 'coinShop.extraText.name', descKey: 'coinShop.extraText.desc', price: 40, max: 7, field: 'extraTextsBought' },
  { id: 'themeAurora', icon: '🌌', nameKey: 'coinShop.themeAurora.name', descKey: 'coinShop.themeAurora.desc', price: 120, max: 1, field: 'themeAuroraBought' },
  { id: 'themeOcean', icon: '🌊', nameKey: 'coinShop.themeOcean.name', descKey: 'coinShop.themeOcean.desc', price: 120, max: 1, field: 'themeOceanBought' }
];

function applyComfortSettings() {
  const hideNumbers = localStorage.getItem('otklik_hide_numbers') === '1';
  const hideStreak = localStorage.getItem('otklik_hide_streak') === '1';
  const hideCoins = localStorage.getItem('otklik_hide_coins') === '1';
  const graphBadge = document.querySelector('.graph-badge');
  if (graphBadge) graphBadge.style.display = hideNumbers ? 'none' : '';
  const resultStats = document.querySelectorAll('#resultStats .card');
  if (hideNumbers) resultStats.forEach((c, i) => { if (i < 4) c.style.display = 'none'; });
  else resultStats.forEach((c, i) => { if (i < 4) c.style.display = ''; });
  const streakCard = $('#streakCard');
  if (streakCard) streakCard.style.display = hideStreak ? 'none' : '';
  const coinCard = $('#coinCard');
  if (coinCard) coinCard.style.display = hideCoins ? 'none' : '';
  const statsCount = $('#statsGrid');
  if (statsCount) statsCount.style.display = hideStreak && hideCoins && hideNumbers ? 'none' : '';
}

$('#coinShopBtn')?.addEventListener('click', () => {
  renderCoinShop();
  openModal('coinShopModal');
});
$('#comfortHideNumbers')?.addEventListener('change', (e) => {
  localStorage.setItem('otklik_hide_numbers', e.target.checked ? '1' : '0');
  applyComfortSettings();
});
$('#comfortHideStreak')?.addEventListener('change', (e) => {
  localStorage.setItem('otklik_hide_streak', e.target.checked ? '1' : '0');
  applyComfortSettings();
});
$('#comfortHideCoins')?.addEventListener('change', (e) => {
  localStorage.setItem('otklik_hide_coins', e.target.checked ? '1' : '0');
  applyComfortSettings();
});

function renderCoinShop() {
  const container = $('#coinShopItems');
  const balance = $('#coinShopBalance');
  if (!container) return;
  const purchases = userData?.purchases || {};
  if (balance) balance.textContent = String(Number(userData?.coins || 0));
  container.innerHTML = '';
  COIN_SHOP_ITEMS.forEach(item => {
    const bought = Number(purchases[item.field] || 0);
    const owned = bought >= item.max;
    const enough = Number(userData?.coins || 0) >= item.price;
    const card = document.createElement('div');
    card.className = 'card';
    card.style.cssText = 'display:flex;align-items:center;gap:12px;margin:10px 0;padding:14px';
    const info = document.createElement('div');
    info.style.cssText = 'flex:1;min-width:0';
    const title = document.createElement('strong');
    title.textContent = `${item.icon} ${t(item.nameKey)}`;
    const desc = document.createElement('div');
    desc.style.cssText = 'font-size:12px;color:var(--muted);margin-top:4px';
    desc.textContent = t(item.descKey);
    info.append(title, desc);
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'btn btn-secondary';
    button.disabled = owned || !enough || !currentUser;
    button.textContent = owned ? t('coinShop.owned') : `${t('coinShop.buy')} · ${item.price} ✦`;
    button.addEventListener('click', () => buyCoinShopItem(item));
    card.append(info, button);
    container.append(card);
  });
}

async function buyCoinShopItem(item) {
  if (!currentUser) return;
  const userRef = doc(db, 'users', currentUser.uid);
  try {
    await runTransaction(db, async transaction => {
      const snapshot = await transaction.get(userRef);
      if (!snapshot.exists()) throw new Error('USER_NOT_FOUND');
      const data = snapshot.data();
      const purchases = data.purchases || {};
      if (Number(data.coins || 0) < item.price) throw new Error('NOT_ENOUGH_COINS');
      if (Number(purchases[item.field] || 0) >= item.max) throw new Error('ALREADY_OWNED');
      transaction.update(userRef, {
        coins: Number(data.coins || 0) - item.price,
        [`purchases.${item.field}`]: Number(purchases[item.field] || 0) + 1
      });
    });
    const snap = await getDoc(userRef);
    if (snap.exists()) userData = { ...userData, ...snap.data() };
    renderCoinShop();
    updateCoinBalance();
    showToast(t('coinShop.bought'));
  } catch (error) {
    showToast(error.message === 'NOT_ENOUGH_COINS' ? t('coinShop.notEnough') : t('common.error'));
    renderCoinShop();
  }
}

function formatHrtDuration(days) {
  if (days < 14) return `${days} ${t('duration.days')}`;
  if (days < 60) return `${Math.floor(days / 7)} ${t('duration.weeks')}`;
  if (days < 365) return `${Math.floor(days / 30)} ${t('duration.months')}`;
  const years = Math.floor(days / 365);
  const remainingMonths = Math.floor((days - years * 365) / 30);
  let out = `${years} ${t('duration.years')}`;
  if (remainingMonths > 0) out += ` ${remainingMonths} ${t('duration.months')}`;
  return out;
}

let _greetingIntervalStarted = false;
function showWelcomeSupport() {
  const uid = currentUser?.uid;
  if (!uid) return;
  const key = `otklik_welcome_seen_${uid}`;
  if (sessionStorage.getItem(key) === '1' || localStorage.getItem(`otklik_welcome_hidden_${uid}`) === '1') return;
  sessionStorage.setItem(key, '1');
  const modal = $('#welcomeSupportModal');
  if (modal) setTimeout(() => openModal('welcomeSupportModal'), 400);
}

function initAppUI() {
  setupUserProfileListener();
  const agencyBlock = document.querySelector('.voice-agency');
  if (agencyBlock) agencyBlock.classList.toggle('hide-out', !!(currentUser && sessionStorage.getItem(`otklik_hide_agency_${currentUser.uid}`) === '1'));
  $('#mainApp').classList.add('ready'); $('#bottomNav').style.display = 'grid';
  setTimeout(() => {
    processMissedStreak().catch(e => console.error('streak check:', e));
  }, 350);
  $('#settingsAvatarText').textContent = userData.profile.avatar || '🦊';
  $('#settingsNickname').value = userData.profile.nickname;
  $('#settingsEmail').textContent = userData.email || currentUser.email || '';
  $('#settingsUserId').textContent = userData.profile?.username ? '@' + userData.profile.username : '';
  $('#mainAvatarEmoji').textContent = userData.profile.avatar || '🦊';
  $$('#settingsAvatarGrid .avatar-opt').forEach(b => b.classList.toggle('selected', b.dataset.val === userData.profile.avatar));
 restoreRemindersSettings();
  const comfortHideNumbers = $('#comfortHideNumbers');
  const comfortHideStreak = $('#comfortHideStreak');
  const comfortHideCoins = $('#comfortHideCoins');
  if (comfortHideNumbers) comfortHideNumbers.checked = localStorage.getItem('otklik_hide_numbers') === '1';
  if (comfortHideStreak) comfortHideStreak.checked = localStorage.getItem('otklik_hide_streak') === '1';
  if (comfortHideCoins) comfortHideCoins.checked = localStorage.getItem('otklik_hide_coins') === '1';
  applyComfortSettings();
  const lbl = $('#langSelectLabel');
  if (lbl) lbl.textContent = LANG_LABELS[currentLang] || currentLang;
  document.querySelectorAll('#langSelectPanel button').forEach(b => b.classList.toggle('active', b.dataset.lang === currentLang));
  updateThemeSelection();

  document.querySelectorAll('.ctrl-btn').forEach(el => el.setAttribute('aria-label', t('common.close')));
  $('#closeStreakLossBtn')?.setAttribute('aria-label', t('common.close'));
  updateHeaderSubtitle(false);
  if (!_greetingIntervalStarted) {
    _greetingIntervalStarted = true;
    setInterval(() => { if (currentUser && userData) updateHeaderSubtitle(true); }, 60000);
  }

  const savedMode = localStorage.getItem('otklik_mode');
  if (savedMode && MODES[savedMode]) activeMode = savedMode;
  else if (savedMode === 'steady') { activeMode = 'fem'; localStorage.setItem('otklik_mode', 'fem'); }
  else if (userData.goal === 'feminine') activeMode = 'fem';
  else if (userData.goal === 'masculine') activeMode = 'masc';
  else activeMode = 'fem';

  targetLow = MODES[activeMode].low; targetHigh = MODES[activeMode].high;
  $('#targetLow').value = targetLow; $('#targetHigh').value = targetHigh;
  $$('.mode').forEach(b => b.classList.toggle('selected', b.dataset.mode === activeMode));
  $('#targetLegend').textContent = `${targetLow}–${targetHigh} ${currentLang === 'ru' ? 'Гц' : 'Hz'}`;
  restoreGraphSettings();
  setPracticeText(); setupRealtimeListeners(); setupSupportListener(); updateStreakCard(); updateHrtWidget(); updateVoiceProgressVisibility(); renderPrograms();
  updateTargetVisibility();
  updateExportDoctorBtn(lastSessionsCache);
  requestAnimationFrame(() => { resizeCanvas(); drawGraph(); });
}


function animateCountUp(el, target, duration = 1100) {
  if (!el) return;
  const from = parseInt(el.textContent) || 0;
  if (from === target) { el.textContent = target; return; }
  const start = performance.now();
  function step(now) {
    const tt = Math.min(1, (now - start) / duration);
    const eased = 1 - Math.pow(1 - tt, 3);
    el.textContent = Math.round(from + (target - from) * eased);
    if (tt < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}

function updateHrtWidget() {
  if (!userData) return;
  const startDate = userData.profile?.hrtStartDate;
  const daysEl = $('#hrtDaysNum'), subEl = $('#hrtSubtitle');
  if (!startDate) {
    if (daysEl) daysEl.textContent = '—';
    if (subEl) subEl.textContent = t('hrt.subtitle.empty');
    return;
  }
  const start = new Date(startDate + 'T00:00:00');
  const days = Math.max(1, Math.floor((new Date() - start) / 86400000) + 1);
  animateCountUp(daysEl, days);
  if (subEl) subEl.textContent = formatHrtDuration(days);
}

$('#hrtSetDateBtn')?.addEventListener('click', () => {
  if (!userData) return;
  const startDate = userData.profile?.hrtStartDate;
  const input = $('#hrtDateInput');
  input.value = startDate || new Date().toISOString().split('T')[0];
  input.max = new Date().toISOString().split('T')[0];
  openModal('hrtDateModal');
});

$('#hrtDateSaveBtn')?.addEventListener('click', async () => {
  const dateVal = $('#hrtDateInput').value;
  if (!dateVal) { showToast(t('toast.error')); return; }
  try {
    await updateDoc(doc(db, 'users', currentUser.uid), { 'profile.hrtStartDate': dateVal });
    if (!userData.profile) userData.profile = {};
    userData.profile.hrtStartDate = dateVal;
    closeModal('hrtDateModal');
    updateHrtWidget();
    showToast(t('toast.dateSaved'));
  } catch (e) { showToast(t('toast.error') + ': ' + e.message); }
});

function updateVoiceProgressVisibility() {
  const el = $('#voiceProgressWidget');
  if (!el) return;
  if (activeMode === 'masc') {
    el.classList.add('shown');
    requestAnimationFrame(() => drawVoiceProgress(lastSessionsCache));
    updateExportDoctorBtn(lastSessionsCache);
  } else {
    el.classList.remove('shown');
  }
}

function updateExportDoctorBtn(sessions) {
  const btn = $('#exportDoctorBtn');
  if (!btn) return;
  const validPts = (sessions || []).filter(s => s.averagePitch != null && s.date);
  const enabled = validPts.length >= 2;
  btn.disabled = !enabled;
  btn.setAttribute('aria-disabled', String(!enabled));
  btn.title = enabled ? '' : t('vp.hint');
}

function drawVoiceProgress(sessions) {
  const canvas = $('#voiceProgressCanvas');
  const emptyEl = $('#vpEmpty');
  if (!canvas) return;
  const container = canvas.parentElement;
  const rect = container.getBoundingClientRect();
  if (!rect.width) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = rect.width * dpr; canvas.height = rect.height * dpr;
  canvas.style.width = rect.width + 'px'; canvas.style.height = rect.height + 'px';
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const w = rect.width, h = rect.height;
  ctx.clearRect(0, 0, w, h);
  const hintEl = $('#vpHint');
  const pts = (sessions || []).filter(s => s.averagePitch && s.date).map(s => ({ date: new Date(s.date), pitch: s.averagePitch })).sort((a,b) => a.date - b.date);
  if (pts.length === 0) {
    if (emptyEl) emptyEl.style.display = 'flex';
    if (hintEl) hintEl.textContent = t('vp.hint');
    return;
  }
  if (emptyEl) emptyEl.style.display = 'none';
  if (hintEl) hintEl.textContent = '';
  const weeks = {};
  pts.forEach(p => {
    const d = p.date; const onejan = new Date(d.getFullYear(), 0, 1);
    const week = Math.ceil((((d - onejan) / 86400000) + onejan.getDay() + 1) / 7);
    const key = `${d.getFullYear()}-W${String(week).padStart(2,'0')}`;
    if (!weeks[key]) weeks[key] = { sum: 0, count: 0, date: d };
    weeks[key].sum += p.pitch; weeks[key].count++;
  });
  const weekArr = Object.values(weeks).map(wk => ({ ...wk, avg: wk.sum / wk.count })).sort((a,b) => a.date - b.date);
  const padL = 42, padR = 12, padT = 18, padB = 28;
  const cw = w - padL - padR, ch = h - padT - padB;
  const minP = Math.min(...weekArr.map(wk => wk.avg)) - 10;
  const maxP = Math.max(...weekArr.map(wk => wk.avg)) + 10;
  ctx.strokeStyle = 'rgba(74,124,89,0.12)'; ctx.lineWidth = 1;
  for (let i = 0; i <= 4; i++) {
    const y = padT + (ch / 4) * i;
    ctx.beginPath(); ctx.moveTo(padL, y); ctx.lineTo(w - padR, y); ctx.stroke();
    ctx.fillStyle = '#8A8A8A'; ctx.font = '600 10px Manrope, sans-serif';
    ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    ctx.fillText(Math.round(maxP - ((maxP - minP) / 4) * i) + '', padL - 6, y);
  }
  const points = weekArr.map((wk, i) => ({
    x: padL + (cw / Math.max(1, weekArr.length - 1)) * i,
    y: padT + ch - ((wk.avg - minP) / Math.max(1, maxP - minP)) * ch
  }));
  const grad = ctx.createLinearGradient(0, padT, 0, padT + ch);
  grad.addColorStop(0, 'rgba(74,124,89,0.25)'); grad.addColorStop(1, 'rgba(74,124,89,0)');
  ctx.beginPath(); ctx.moveTo(points[0].x, padT + ch);
  points.forEach(p => ctx.lineTo(p.x, p.y));
  ctx.lineTo(points[points.length - 1].x, padT + ch); ctx.closePath();
  ctx.fillStyle = grad; ctx.fill();
  ctx.beginPath();
  points.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y));
  ctx.strokeStyle = '#4A7C59'; ctx.lineWidth = 2.5; ctx.lineJoin = 'round'; ctx.stroke();
  if (weekArr.length === 1) {
    points[0].x = padL + cw / 2;
    ctx.beginPath(); ctx.moveTo(points[0].x, points[0].y); ctx.lineTo(w - padR, points[0].y);
    ctx.strokeStyle = '#4A7C59'; ctx.lineWidth = 2.5; ctx.stroke();
  }
  points.forEach(p => { ctx.beginPath(); ctx.arc(p.x, p.y, 4, 0, Math.PI*2); ctx.fillStyle = '#fff'; ctx.fill(); ctx.strokeStyle = '#4A7C59'; ctx.lineWidth = 2; ctx.stroke(); });
  ctx.fillStyle = '#8A8A8A'; ctx.font = '600 9px Manrope, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
  const step = Math.max(1, Math.floor(weekArr.length / 5));
  weekArr.forEach((wk, i) => {
    if (i % step !== 0 && i !== weekArr.length - 1) return;
    ctx.fillText(wk.date.toLocaleDateString(), points[i].x, padT + ch + 8);
  });
}

$('#exportDoctorBtn')?.addEventListener('click', async () => {
  const btn = $('#exportDoctorBtn');
  if (btn.disabled) { showToast(t('vp.hint')); return; }
  const chartCanvas = $('#voiceProgressCanvas');
  if (!chartCanvas || chartCanvas.width <= 10 || chartCanvas.height <= 10) { showToast(t('toast.notEnoughData')); return; }
  if (typeof html2canvas === 'undefined') { showToast(t('toast.error')); return; }
  const report = document.createElement('div');
  report.style.cssText = 'position:fixed;left:-9999px;top:0;width:900px;background:#fff;padding:44px;font-family:Manrope,sans-serif;color:#2D2D2D;box-sizing:border-box;';
  const nick = (userData?.profile?.nickname || 'User');
  const startDate = userData?.profile?.hrtStartDate;
  const daysOnHrt = startDate ? Math.max(1, Math.floor((Date.now() - new Date(startDate + 'T00:00:00')) / 86400000) + 1) : null;
  report.innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:32px;padding-bottom:20px;border-bottom:2px solid #E5E5E3;">
      <div><div style="font-size:32px;font-weight:800;color:#4A7C59;">✦ ${t('app.name')}</div><div style="font-size:13px;color:#8A8A8A;margin-top:4px;font-weight:600;">${t('vp.title')}</div></div>
      <div style="text-align:right;font-size:13px;color:#8A8A8A;line-height:1.6;">
        <div><b style="color:#2D2D2D;">${nick}</b></div>
        ${daysOnHrt ? `<div>${t('hrt.day')} ${daysOnHrt} ${t('hrt.onHrt')}</div>` : ''}
        <div>${new Date().toLocaleDateString()}</div>
      </div>
    </div>
    <img src="${chartCanvas.toDataURL('image/png')}" style="width:100%;border-radius:16px;border:1px solid #E5E5E3;background:#F2F2F0;" />
    <div style="margin-top:28px;font-size:11px;color:#8A8A8A;text-align:center;padding-top:20px;border-top:1px solid #E5E5E3;line-height:1.6;">${new Date().toLocaleDateString()}</div>`;
  document.body.appendChild(report);
  try {
    const rendered = await html2canvas(report, { scale: 2, backgroundColor: '#ffffff', logging: false });
    const link = document.createElement('a');
    link.download = `otklik-voice-${new Date().toISOString().split('T')[0]}.png`;
    link.href = rendered.toDataURL('image/png');
    link.click();
    showToast(t('toast.reportSaved'));
  } catch (e) { showToast(t('toast.error')); }
  finally { report.remove(); }
});

function renderPrograms() {
  const grid = $('#programsGrid');
  if (!grid) return;
  grid.innerHTML = PROGRAMS.map(p => `
    <button class="program-card ${p.premium ? 'premium' : ''}" data-program="${p.id}">
      <div class="program-icon">${p.icon}</div>
      <div class="program-title">${t(p.titleKey)}</div>
      <div class="program-desc">${t(p.descKey)}</div>
      <div class="program-meta">${t(p.metaKey)}</div>
    </button>
  `).join('');
}

$('#programsGrid')?.addEventListener('click', (e) => {
  const btn = e.target.closest('[data-program]'); if (!btn) return;
  const prog = PROGRAMS.find(p => p.id === btn.dataset.program); if (!prog) return;
  if (prog.premium) { openModal('closerModal'); return; }
  if (prog.free) openFreeProgram();
});

function openFreeProgram() {
  const host = $('#freeProgramDays'); if (!host) return;
  const days = FREE_PROGRAM_DAYS[currentLang] || FREE_PROGRAM_DAYS.en;
  host.innerHTML = days.map((d, i) => `
    <div class="free-program-day" data-day="${i}">
      <div class="fpd-title"><span>${d.title}</span><span class="fpd-chevron">▾</span></div>
      <div class="fpd-text">${d.text}</div>
    </div>`).join('');
  openModal('freeProgramModal');
}

$('#freeProgramDays')?.addEventListener('click', (e) => {
  const day = e.target.closest('[data-day]'); if (!day) return;
  day.classList.toggle('open');
});

function updateTargetVisibility() {
  const inTargetMini = $('#inTargetMiniStat');
  const targetCard = $('#targetStatCard');
  const resultCard = $('#resultTargetCard');
  if (showTarget) {
    if (inTargetMini) { inTargetMini.classList.remove('hidden-stat'); inTargetMini.style.display = ''; }
    if (targetCard) { targetCard.classList.remove('hidden-stat'); targetCard.style.display = ''; }
  } else {
    if (inTargetMini) { inTargetMini.classList.add('hidden-stat'); }
    if (targetCard) { targetCard.classList.add('hidden-stat'); }
  }
  if (resultCard) resultCard.style.display = showTarget ? '' : 'none';
}

function localDateKey(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
}
function shiftDateKey(key, days) {
  const d = new Date(`${key}T12:00:00`);
  d.setDate(d.getDate() + days);
  return localDateKey(d);
}
function updateCoinBalance() {
  const balance = Math.max(0, Number(userData?.coins ?? 300));
  const el = $('#coinBalance');
  if (el) el.textContent = Number.isInteger(balance) ? String(balance) : balance.toFixed(1);
}
function updateStreakCard() {
  if (!userData) return;
  const streak = Math.max(0, Number(userData.streak || 0));
  const today = localDateKey();
  const practicedToday = userData.lastPracticeDate === today || userData.streakBroken?.restoredForDate === today;
  const broken = !!userData.streakBroken && userData.streakBroken.restoreUntil === today && !userData.streakBroken.restored;
  const card = $('#streakCard'); if (!card) return;
  card.classList.toggle('lit', practicedToday); card.classList.toggle('unlit', !practicedToday);
  card.classList.toggle('broken', broken);
  const v = $('#streakValue'); if (v) v.textContent = streak;
  const p = null; if (p) p.style.width = `${Math.min(100, (streak % 7) / 7 * 100)}%`;
  const h = $('#streakHint'); if (h) h.textContent = broken ? (currentLang === 'ru' ? 'Вчера тренировка пропущена' : 'Yesterday was missed') : streak ? `${streak} ${t('stats.days')}` : t('stats.streakHint');
  const repair = $('#streakRepairBtn');
  if (repair) {
    repair.classList.toggle('show', broken);
    repair.style.display = broken ? 'flex' : 'none';
    repair.disabled = !broken || Number(userData.coins ?? 300) < 185;
    const label = repair.querySelector('span:nth-child(2)');
    if (label) label.textContent = currentLang === 'ru' ? (Number(userData.coins ?? 300) < 185 ? 'Недостаточно монеток' : 'Восстановить стрик') : (Number(userData.coins ?? 300) < 185 ? 'Not enough coins' : 'Restore streak');
  }
  updateCoinBalance();
}
async function processMissedStreak() {
  if (!currentUser || !userData) return;
  const broken = userData.streakBroken;
  if (broken && broken.restoreUntil === localDateKey() && !broken.restored) openStreakLossModal();
  updateStreakCard();
}
function openStreakLossModal() {
  if (!userData?.streakBroken || userData.streakBroken.restoreUntil !== localDateKey() || userData.streakBroken.restored) return;
  const key = `otklik_streak_loss_seen_${currentUser.uid}_${localDateKey()}`;
  if (sessionStorage.getItem(key)) return;
  sessionStorage.setItem(key, '1');
  openModal('streakLossModal');
}
async function restoreStreak() {
  if (!currentUser || !userData) return;
  const uid = currentUser.uid;
  const today = localDateKey();
  const userRef = doc(db, 'users', uid);
  try {
    let restored = false;
    await runTransaction(db, async transaction => {
      const snap = await transaction.get(userRef);
      if (!snap.exists()) throw new Error('User profile not found');
      const data = snap.data();
      const broken = data.streakBroken;
      if (!broken || broken.restoreUntil !== today || broken.restored) throw new Error('Streak restoration is unavailable');
      if (Number(data.coins ?? 0) < 185) throw new Error('Not enough coins');
      transaction.update(userRef, {
        coins: Number(data.coins ?? 0) - 185,
        streak: Number(broken.previousStreak || 0),
        lastPracticeDate: broken.missedDate,
        streakBroken: { ...broken, restored: true, restoredForDate: today }
      });
      restored = true;
    });
    if (restored) {
      const card = $('#streakCard');
      if (card) {
        card.classList.add('repairing');
        const r = card.getBoundingClientRect();
        for (let i = 0; i < 18; i++) {
          const particle = document.createElement('span');
          particle.className = 'fire-burst';
          particle.textContent = '✦';
          particle.style.left = `${r.left + r.width / 2 + (Math.random() - .5) * 70}px`;
          particle.style.top = `${r.top + r.height / 2}px`;
          document.body.appendChild(particle);
          particle.animate([{ opacity: 1, transform: 'translate(0,0) scale(.6)' }, { opacity: 0, transform: `translate(${(Math.random() - .5) * 110}px,${-35 - Math.random() * 80}px) scale(1.3)` }], { duration: 650, easing: 'ease-out' }).onfinish = () => particle.remove();
        }
        setTimeout(() => card.classList.remove('repairing'), 1400);
      }
      const repairButton = $('#streakRepairBtn');
      if (repairButton) { spawnDissolveParticles(repairButton); repairButton.classList.add('dissolving'); setTimeout(() => { repairButton.classList.remove('dissolving'); repairButton.style.display = 'none'; }, 500); }
      closeModal('streakLossModal');
      const refreshed = await getDoc(userRef);
      if (refreshed.exists()) userData = { ...userData, ...refreshed.data() };
      updateStreakCard();
      showToast(t('toast.streakRestored'));
    }
  } catch (error) {
    console.error('restoreStreak transaction:', error);
    showToast(t('toast.streakRestoreFailed'));
  }
}
function spawnDissolveParticles(el) {
  if (!el) return;
  const r = el.getBoundingClientRect();
  for (let i=0;i<24;i++) {
    const p=document.createElement('span');
    p.className='dissolve-particle';
    p.style.cssText=`left:${r.left+Math.random()*r.width}px;top:${r.top+Math.random()*r.height}px;background:${['#5BCEFA','#F5A9B8','#FFFFFF','#4A7C59'][i%4]};width:${2+Math.random()*4}px;height:${2+Math.random()*4}px`;
    document.body.appendChild(p);
    p.animate([{opacity:1,transform:'translate(0,0) scale(1)'},{opacity:0,transform:`translate(${(Math.random()-.5)*100}px,${-20-Math.random()*90}px) scale(.1)`}],{duration:450+Math.random()*350,easing:'ease-out'}).onfinish=()=>p.remove();
  }
}

function setupUserProfileListener() {
  if (!currentUser || document.hidden) return;
  if (unsubscribeUserProfile) unsubscribeUserProfile();
  const uid = currentUser.uid;
  let previousCoins = null;
  unsubscribeUserProfile = onSnapshot(doc(db, 'users', uid), snap => {
    if (!snap.exists()) return;
    const fresh = snap.data();
    const nextCoins = Number(fresh.coins ?? 300);
    if (previousCoins !== null && nextCoins > previousCoins) {
      showToast(t('toast.coinsEarned', { amount: (nextCoins - previousCoins).toFixed(1) }));
    }
    previousCoins = nextCoins;
    userData = { ...userData, ...fresh };
    updateCoinBalance();
    updateStreakCard();
    if (fresh.streakBroken && fresh.streakBroken.restoreUntil === localDateKey() && !fresh.streakBroken.restored) openStreakLossModal();
  }, error => console.error('user profile listener:', error));
}

function setupRealtimeListeners() {
  if (!currentUser || document.hidden) return;
  const uid = currentUser.uid;
  if (unsubscribeSessions) unsubscribeSessions();
  const qSessions = query(collection(db, 'users', uid, 'sessions'), orderBy('createdAt', 'desc'), limit(30));
  unsubscribeSessions = onSnapshot(qSessions, (snap) => {
    const sessions = []; snap.forEach(d => sessions.push({ id: d.id, ...d.data() }));
    lastSessionsCache = sessions;
    renderStats(sessions); renderRecent(sessions); updateStreakCard();
    if (activeMode === 'masc') {
      drawVoiceProgress(sessions);
      updateExportDoctorBtn(sessions);
    }
  }, (err) => console.error('sessions listener:', err));
}

function setupSupportListener() {
  if (!currentUser || document.hidden) return;
  if (unsubscribeSupport) unsubscribeSupport();
  const uid = currentUser.uid;
  lastSeenSupportTime = parseInt(localStorage.getItem(`otklik_support_seen_${uid}`) || '0', 10);
  const q = query(collection(db, 'support', uid, 'messages'), orderBy('createdAt', 'asc'));
  unsubscribeSupport = onSnapshot(q, (snap) => {
    supportMessages = [];
    snap.forEach(d => supportMessages.push({ id: d.id, ...d.data() }));
    if (supportChatOpen) {
      supportMessages.forEach(m => {
        const ts = m.createdAt?.toMillis?.() || 0;
        if (ts > lastSeenSupportTime) lastSeenSupportTime = ts;
      });
      localStorage.setItem(`otklik_support_seen_${uid}`, String(lastSeenSupportTime));
      renderSupportMessages();
    }
    updateUnreadIndicator();
  }, (err) => console.error('support:', err));
}

function updateUnreadIndicator() {
  let unread = 0;
  if (!supportChatOpen) {
    supportMessages.forEach(m => {
      if (m.from === 'owner') {
        const ts = m.createdAt?.toMillis?.() || 0;
        if (ts > lastSeenSupportTime) unread++;
      }
    });
  }
  const av = $('#avatarUnreadDot'); if (av) av.style.display = unread > 0 ? 'block' : 'none';
  const sb = $('#supportUnreadDot'); if (sb) sb.style.display = unread > 0 ? 'block' : 'none';
}

function formatDateLabel(date) {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diff = (today - d) / 86400000;
  const relative = new Intl.RelativeTimeFormat(currentLang, { numeric: 'auto' });
  if (diff === 0) return relative.format(0, 'day');
  if (diff === 1) return relative.format(-1, 'day');
  return date.toLocaleDateString(currentLang);
}
function escapeHtml(str) { return String(str).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

function updateSupportStatus() {
  const hour = new Date().getHours();
  const online = hour >= 8 && hour < 22;
  const statusEl = $('#supportStatus'), bannerEl = $('#supportHoursBanner');
  if (statusEl) { statusEl.textContent = online ? t('support.status') : t('support.statusOffline'); statusEl.classList.toggle('online', online); }
  if (bannerEl) { bannerEl.textContent = online ? t('support.online') : t('support.offline'); bannerEl.classList.toggle('offline', !online); }
}

function renderWelcomeBubble() {
  const hour = new Date().getHours();
  const online = hour >= 8 && hour < 22;
  return `
    <div class="chat-welcome">
      <div class="chat-bubble-wrap owner">
        <div class="chat-bubble owner">
          <div class="chat-bubble-text">${t('support.welcome')}</div>
        </div>
      </div>
      ${!online ? `<div class="chat-system-msg">${t('support.offlineMsg')}</div>` : ''}
    </div>`;
}

function renderSupportBubble(m, isNew) {
  const isOwner = m.from === 'owner';
  const time = m.createdAt?.toDate?.();
  const timeStr = time ? time.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}) : '';
  const reactions = m.reactions || {};
  const replyHtml = m.replyTo ? `<div class="chat-reply-quote"><b>${escapeHtml(m.replyTo.from === 'owner' ? t('support.name') : 'Вы')}</b> ${escapeHtml(m.replyTo.text)}</div>` : '';
  const template = document.createElement('div');
  template.innerHTML = `
    <div class="chat-bubble-wrap ${isOwner ? 'owner' : 'user'} ${isNew ? 'bubble-new' : ''}" data-id="${escapeHtml(m.id)}">
      <div class="chat-bubble ${isOwner ? 'owner' : 'user'}">
        ${replyHtml}
        <div class="chat-bubble-text">${escapeHtml(m.text || '')}</div>
        <div class="chat-bubble-time">${timeStr}</div>
      </div>
      <div class="chat-bubble-actions">
        <button class="chat-action-btn" data-reply="${escapeHtml(m.id)}" title="Reply">↩</button>
        <button class="chat-action-btn" data-react="${escapeHtml(m.id)}" title="React">😊</button>
      </div>
    </div>`;
  const bubbleWrap = template.firstElementChild;
  const validReactions = Object.entries(reactions).filter(([emoji, arr]) => ['❤️','👍','😊','🙏','✨','🎉'].includes(emoji) && Array.isArray(arr) && arr.length);
  if (validReactions.length) {
    const reactionHost = document.createElement('div');
    reactionHost.className = 'chat-reactions';
    validReactions.forEach(([emoji, arr]) => {
      const button = document.createElement('button');
      button.className = 'chat-reaction';
      button.dataset.msg = String(m.id);
      button.dataset.emoji = emoji;
      button.textContent = `${emoji} ${arr.length}`;
      reactionHost.appendChild(button);
    });
    bubbleWrap.querySelector('.chat-bubble').appendChild(reactionHost);
  }
  return bubbleWrap;
}

function renderSupportMessages() {
  const host = $('#chatMessages'); if (!host) return;
  const existingIds = new Set([...host.querySelectorAll('.chat-bubble-wrap')].map(c => c.dataset.id).filter(Boolean));
  const items = [{ type: 'welcome' }];
  let lastDate = null;
  supportMessages.forEach(m => {
    const date = m.createdAt?.toDate?.() || new Date();
    const dateKey = date.toDateString();
    if (dateKey !== lastDate) { items.push({ type: 'date', date }); lastDate = dateKey; }
    items.push({ type: 'msg', msg: m });
  });
  const animate = supportFirstRender; supportFirstRender = false;
  if (!host.querySelector('.chat-welcome')) {
    const welcome = document.createElement('div');
    welcome.innerHTML = renderWelcomeBubble();
    host.appendChild(welcome.firstElementChild);
  }
  const wanted = new Set(supportMessages.map(m => String(m.id)));
  host.querySelectorAll('.chat-bubble-wrap[data-id]').forEach(node => {
    if (!wanted.has(node.dataset.id)) node.remove();
  });
  supportMessages.forEach((msg, index) => {
    if (host.querySelector(`.chat-bubble-wrap[data-id="${CSS.escape(String(msg.id))}"]`)) return;
    const date = msg.createdAt?.toDate?.() || new Date();
    const previous = supportMessages[index - 1]?.createdAt?.toDate?.();
    if (!previous || previous.toDateString() !== date.toDateString()) {
      const divider = document.createElement('div');
      divider.className = 'chat-date-divider';
      const span = document.createElement('span');
      span.textContent = formatDateLabel(date);
      divider.appendChild(span);
      host.appendChild(divider);
    }
    const bubbleNode = renderSupportBubble(msg, animate || !existingIds.has(msg.id));
    if (bubbleNode) host.appendChild(bubbleNode);
  });
  host.scrollTop = host.scrollHeight;
}

$('#chatMessages')?.addEventListener('click', (e) => {
  const replyBtn = e.target.closest('[data-reply]'); if (replyBtn) { startReply(replyBtn.dataset.reply); return; }
  const reactBtn = e.target.closest('[data-react]'); if (reactBtn) { showReactionPicker(reactBtn); return; }
  const reactionBtn = e.target.closest('.chat-reaction'); if (reactionBtn) { toggleReaction(reactionBtn.dataset.msg, reactionBtn.dataset.emoji); return; }
});

function startReply(msgId) {
  const msg = supportMessages.find(m => m.id === msgId); if (!msg) return;
  replyingTo = { id: msgId, text: msg.text.slice(0, 80), from: msg.from };
  $('#chatReplyName').textContent = msg.from === 'owner' ? t('support.name') : 'Вы';
  $('#chatReplyText').textContent = replyingTo.text;
  $('#chatReplyPreview').style.display = 'flex';
  $('#chatInput').focus();
}

$('#chatReplyCancel')?.addEventListener('click', () => { replyingTo = null; $('#chatReplyPreview').style.display = 'none'; });

function showReactionPicker(btn) {
  document.querySelectorAll('.reaction-picker').forEach(p => p.remove());
  const picker = document.createElement('div');
  picker.className = 'reaction-picker';
  picker.innerHTML = ['❤️','👍','😊','🙏','✨','🎉'].map(e => `<button data-emoji="${e}">${e}</button>`).join('');
  document.body.appendChild(picker);
  const rect = btn.getBoundingClientRect();
  picker.style.left = Math.max(8, Math.min(window.innerWidth - 230, rect.left - 60)) + 'px';
  picker.style.top = (rect.top - 50) + 'px';
  const msgId = btn.dataset.react;
  picker.querySelectorAll('button').forEach(b => b.addEventListener('click', () => { toggleReaction(msgId, b.dataset.emoji); picker.remove(); }));
  setTimeout(() => {
    const close = (ev) => { if (!picker.contains(ev.target)) { picker.remove(); document.removeEventListener('click', close); } };
    document.addEventListener('click', close);
  }, 10);
}

async function toggleReaction(msgId, emoji) {
  if (!currentUser) return;
  const uid = currentUser.uid;
  const msg = supportMessages.find(m => m.id === msgId); if (!msg) return;
  const reactions = msg.reactions || {};
  const arr = reactions[emoji] || [];
  const field = `reactions.${emoji}`;
  try {
    if (arr.includes(uid)) await updateDoc(doc(db, 'support', uid, 'messages', msgId), { [field]: arrayRemove(uid) });
    else await updateDoc(doc(db, 'support', uid, 'messages', msgId), { [field]: arrayUnion(uid) });
  } catch (e) { showToast(t('toast.error') + ': ' + e.message); }
}

function updateModeHint() {
  const el = $('#modeHint');
  if (!el) return;
  const key = activeMode === 'fem' ? 'mode.femHint' : activeMode === 'masc' ? 'mode.mascHint' : 'mode.neutralHint';
  el.textContent = t(key);
}

function switchMode(newMode) {
  if (newMode === activeMode) return;
  const oldLow = targetLow, oldHigh = targetHigh;
  const newLow = MODES[newMode].low, newHigh = MODES[newMode].high;
  activeMode = newMode;
  $$('.mode').forEach(m => m.classList.toggle('selected', m.dataset.mode === newMode));
  localStorage.setItem('otklik_mode', newMode);
  const start = performance.now();
  const dur = 400;
  function step(now) {
    const tt = Math.min(1, (now - start) / dur);
    const eased = 1 - Math.pow(1 - tt, 3);
    targetLow = Math.round(oldLow + (newLow - oldLow) * eased);
    targetHigh = Math.round(oldHigh + (newHigh - oldHigh) * eased);
    drawGraph();
    if (tt < 1) requestAnimationFrame(step);
    else {
      targetLow = newLow; targetHigh = newHigh;
      $('#targetLow').value = targetLow; $('#targetHigh').value = targetHigh;
      $('#targetLegend').textContent = `${targetLow}–${targetHigh} ${currentLang === 'ru' ? 'Гц' : 'Hz'}`;
      drawGraph();
    }
  }
  requestAnimationFrame(step);
  updateModeHint(); updateVoiceProgressVisibility(); updateHrtWidget();
}

$$('.mode').forEach(b => b.addEventListener('click', () => {
  if (running) return showToast(t('toast.finishTrainFirst'));
  switchMode(b.dataset.mode);
}));

let gmodeTimer = null; const gmodeToggle = $('#gmodeToggle'), gmodePanel = $('#gmodePanel');
function closeGmodePanel() { clearTimeout(gmodeTimer); gmodePanel.classList.remove('open'); gmodeToggle.classList.remove('open'); }
function openGmodePanel() { gmodePanel.classList.add('open'); gmodeToggle.classList.add('open'); clearTimeout(gmodeTimer); gmodeTimer = setTimeout(closeGmodePanel, 10000); }
gmodeToggle.addEventListener('click', (e) => { e.stopPropagation(); if (gmodePanel.classList.contains('open')) closeGmodePanel(); else openGmodePanel(); });
document.addEventListener('click', (e) => { if (!gmodePanel.classList.contains('open')) return; if (gmodePanel.contains(e.target) || gmodeToggle.contains(e.target)) return; closeGmodePanel(); });
$$('.gmode').forEach(b => b.addEventListener('click', (e) => { e.stopPropagation(); graphStyle = b.dataset.graph; $$('.gmode').forEach(g => g.classList.toggle('active', g === b)); drawGraph(); closeGmodePanel(); }));

$('#graphSettingsBtn')?.addEventListener('click', () => { const panel = $('#graphSettings'), btn = $('#graphSettingsBtn'); panel.classList.toggle('open'); btn.classList.toggle('open', panel.classList.contains('open')); });

$('#lineThickness')?.addEventListener('input', (e) => { lineThickness = parseFloat(e.target.value); $('#lineThicknessValue').textContent = lineThickness.toFixed(1); localStorage.setItem('lineThickness', lineThickness); drawGraph(); });
$('#graphResponse')?.addEventListener('change', e => { graphResponse = ['smooth','sharp','instant'].includes(e.target.value) ? e.target.value : 'smooth'; localStorage.setItem('graphResponse', graphResponse); });
$('#lineColor')?.addEventListener('input', (e) => { lineColor = e.target.value; $('#lineColorHex').value = lineColor.toUpperCase(); localStorage.setItem('lineColor', lineColor); drawGraph(); });
$('#lineColorHex')?.addEventListener('change', (e) => {
  let v = e.target.value.trim();
  if (!v.startsWith('#')) v = '#' + v;
  if (/^#[0-9a-f]{6}$/i.test(v)) {
    lineColor = v.toLowerCase();
    e.target.value = lineColor.toUpperCase();
    $('#lineColor').value = lineColor;
    localStorage.setItem('lineColor', lineColor);
    drawGraph();
  } else e.target.value = lineColor.toUpperCase();
});
$('#targetLow')?.addEventListener('change', () => { const v = parseInt($('#targetLow').value, 10); if (isNaN(v) || v < 50 || v > 450 || v >= targetHigh) { $('#targetLow').value = targetLow; return; } targetLow = v; $('#targetLegend').textContent = `${targetLow}–${targetHigh} ${currentLang === 'ru' ? 'Гц' : 'Hz'}`; localStorage.setItem('targetLow', targetLow); drawGraph(); });
$('#targetHigh')?.addEventListener('change', () => { const v = parseInt($('#targetHigh').value, 10); if (isNaN(v) || v < 50 || v > 450 || v <= targetLow) { $('#targetHigh').value = targetHigh; return; } targetHigh = v; $('#targetLegend').textContent = `${targetLow}–${targetHigh} ${currentLang === 'ru' ? 'Гц' : 'Hz'}`; localStorage.setItem('targetHigh', targetHigh); drawGraph(); });
$('#showZones')?.addEventListener('change', (e) => { showZones = e.target.checked; $('#zoneLegend').style.display = showZones ? 'flex' : 'none'; localStorage.setItem('showZones', showZones ? '1' : '0'); drawGraph(); });

$('#resetZoneColors')?.addEventListener('click', () => {
  zoneColors = { male: '#6495ED', andro: '#ffffff', female: '#ffa0be', target: '#22C55E' };
  Object.entries(zoneColorMap).forEach(([id, key]) => { const el = document.getElementById(id); if (el) el.value = zoneColors[key]; });
  updateZoneLegendSwatches(); localStorage.setItem('zoneColors', JSON.stringify(zoneColors)); drawGraph();
  showToast(t('toast.colorReset'));
});

function hexToRgb(hex) { const r = parseInt(hex.slice(1,3), 16), g = parseInt(hex.slice(3,5), 16), b = parseInt(hex.slice(5,7), 16); return { r, g, b }; }
function zoneFillColor(hex, vis = 1) { const { r, g, b } = hexToRgb(hex); const brightness = (r + g + b) / 3; const base = brightness > 240 ? 0.02 : 0.1; return `rgba(${r},${g},${b},${base * vis})`; }
function zoneBorderColor(hex, vis = 1) { const { r, g, b } = hexToRgb(hex); const brightness = (r + g + b) / 3; const base = brightness > 240 ? 0.28 : 0.55; return `rgba(${r},${g},${b},${base * vis})`; }
function hexToRgba(hex, alpha) { const { r, g, b } = hexToRgb(hex); return `rgba(${r},${g},${b},${alpha})`; }

const zoneColorMap = { colorMale: 'male', colorAndro: 'andro', colorFemale: 'female', colorTarget: 'target' };
Object.entries(zoneColorMap).forEach(([inputId, key]) => {
  const input = document.getElementById(inputId); if (!input) return;
  input.value = zoneColors[key];
  input.addEventListener('input', () => { zoneColors[key] = input.value; localStorage.setItem('zoneColors', JSON.stringify(zoneColors)); updateZoneLegendSwatches(); drawGraph(); });
});
function updateZoneLegendSwatches() { const dots = $$('#zoneLegend .zone-dot'); if (dots.length >= 3) { dots[0].style.background = zoneColors.male; dots[1].style.background = zoneColors.andro; dots[2].style.background = zoneColors.female; } }

function animateZoneVisibility(key, target) {
  const from = zoneVisibility[key];
  if (Math.abs(from - target) < 0.001) { zoneVisibility[key] = target; return; }
  const start = performance.now();
  const dur = 320;
  function step(now) {
    const t = Math.min(1, (now - start) / dur);
    const eased = 1 - Math.pow(1 - t, 3);
    zoneVisibility[key] = from + (target - from) * eased;
    drawGraph();
    if (t < 1) requestAnimationFrame(step);
    else zoneVisibility[key] = target;
  }
  requestAnimationFrame(step);
}

function bindZoneToggle(id, key) {
  const el = document.getElementById(id);
  if (!el) return;
  el.addEventListener('change', () => {
    const checked = el.checked;
    zoneVisible[key] = checked;
    try { localStorage.setItem('zoneVisible', JSON.stringify(zoneVisible)); } catch(e) {}
    animateZoneVisibility(key, checked ? 1 : 0);
    if (key === 'target') {
      showTarget = checked;
      localStorage.setItem('showTarget', checked ? '1' : '0');
      updateTargetVisibility();
    }
  });
}
bindZoneToggle('showZoneMale', 'male');
bindZoneToggle('showZoneAndro', 'andro');
bindZoneToggle('showZoneFemale', 'female');
bindZoneToggle('showZoneTarget', 'target');

function restoreZoneVisibility() {
  if (localStorage.getItem('showTarget') === '0') showTarget = false;
  zoneVisible.target = showTarget;
  zoneVisibility.target = showTarget ? 1 : 0;
  if ($('#showZoneTarget')) $('#showZoneTarget').checked = showTarget;
  try {
    const saved = JSON.parse(localStorage.getItem('zoneVisible') || 'null');
    if (saved && typeof saved === 'object') {
      ['male', 'andro', 'female'].forEach(k => {
        if (typeof saved[k] === 'boolean') {
          zoneVisible[k] = saved[k];
          zoneVisibility[k] = saved[k] ? 1 : 0;
        }
      });
    }
  } catch(e) {}
  const map = { male: 'showZoneMale', andro: 'showZoneAndro', female: 'showZoneFemale' };
  Object.entries(map).forEach(([key, id]) => {
    const el = document.getElementById(id);
    if (el) el.checked = zoneVisible[key];
  });
}

function restoreGraphSettings() {
  graphResponse = ['sharp','instant'].includes(localStorage.getItem('graphResponse')) ? localStorage.getItem('graphResponse') : 'sharp';
  if ($('#graphResponse')) $('#graphResponse').value = graphResponse;
  const savedScale = Number(localStorage.getItem('graphScaleSpan'));
  const savedOffset = Number(localStorage.getItem('graphScaleOffset'));
  if (Number.isFinite(savedScale) && savedScale >= 100 && savedScale <= 1800) graphScaleSpan = savedScale;
  graphScaleOffset = Number.isFinite(savedOffset) ? Math.max(-1200, Math.min(1200, savedOffset)) : 0;
  scaleMin = Math.max(0, 250 - graphScaleSpan / 2 + graphScaleOffset);
  graphScaleOffset = scaleMin - (250 - graphScaleSpan / 2);
  scaleMax = scaleMin + graphScaleSpan;
  updateHzScaleLabels();
  const lt = parseFloat(localStorage.getItem('lineThickness'));
  if (!isNaN(lt) && lt >= 1 && lt <= 8) { lineThickness = lt; if ($('#lineThickness')) $('#lineThickness').value = lt; if ($('#lineThicknessValue')) $('#lineThicknessValue').textContent = lt.toFixed(1); }
  const lc = localStorage.getItem('lineColor');
  if (lc && /^#[0-9a-f]{6}$/i.test(lc)) { lineColor = lc; if ($('#lineColor')) $('#lineColor').value = lc; if ($('#lineColorHex')) $('#lineColorHex').value = lc.toUpperCase(); }
  const low = parseInt(localStorage.getItem('targetLow'), 10), high = parseInt(localStorage.getItem('targetHigh'), 10);
  if (!isNaN(low) && !isNaN(high) && low < high && low >= 50 && high <= 450) { targetLow = low; targetHigh = high; $('#targetLow').value = low; $('#targetHigh').value = high; }
  if (localStorage.getItem('showZones') === '0') { showZones = false; $('#showZones').checked = false; $('#zoneLegend').style.display = 'none'; }
  const zc = localStorage.getItem('zoneColors');
  if (zc) { try { const parsed = JSON.parse(zc); Object.keys(zoneColors).forEach(k => { if (typeof parsed[k] === 'string' && /^#[0-9a-f]{6}$/i.test(parsed[k])) zoneColors[k] = parsed[k]; }); Object.entries(zoneColorMap).forEach(([id, key]) => { const el = document.getElementById(id); if (el) el.value = zoneColors[key]; }); updateZoneLegendSwatches(); } catch(e){} }
  restoreZoneVisibility();
}

function restoreRemindersSettings() {
  waterReminderEnabled = localStorage.getItem('waterReminder') === '1'; restReminderEnabled = localStorage.getItem('restReminder') === '1';
  const wi = parseInt(localStorage.getItem('waterInterval'), 10), ri = parseInt(localStorage.getItem('restInterval'), 10);
  if (!isNaN(wi) && wi >= 3 && wi <= 60) waterInterval = wi;
  if (!isNaN(ri) && ri >= 3 && ri <= 60) restInterval = ri;
  if ($('#waterToggle')) $('#waterToggle').checked = waterReminderEnabled;
  if ($('#restToggle')) $('#restToggle').checked = restReminderEnabled;
  if ($('#waterInterval')) { $('#waterInterval').value = waterInterval; $('#waterInterval').disabled = !waterReminderEnabled; }
  if ($('#restInterval')) { $('#restInterval').value = restInterval; $('#restInterval').disabled = !restReminderEnabled; }
}

$('#waterToggle')?.addEventListener('change', () => { waterReminderEnabled = $('#waterToggle').checked; localStorage.setItem('waterReminder', waterReminderEnabled ? '1' : '0'); $('#waterInterval').disabled = !waterReminderEnabled; if (running) { stopReminderTimers(); startReminderTimers(); } });
$('#waterInterval')?.addEventListener('change', () => { const v = parseInt($('#waterInterval').value, 10); if (isNaN(v) || v < 3 || v > 60) { $('#waterInterval').value = waterInterval; return; } waterInterval = v; localStorage.setItem('waterInterval', waterInterval); if (running && waterReminderEnabled) { stopReminderTimers(); startReminderTimers(); } });
$('#restToggle')?.addEventListener('change', () => { restReminderEnabled = $('#restToggle').checked; localStorage.setItem('restReminder', restReminderEnabled ? '1' : '0'); $('#restInterval').disabled = !restReminderEnabled; if (running) { stopReminderTimers(); startReminderTimers(); } });
$('#restInterval')?.addEventListener('change', () => { const v = parseInt($('#restInterval').value, 10); if (isNaN(v) || v < 3 || v > 60) { $('#restInterval').value = restInterval; return; } restInterval = v; localStorage.setItem('restInterval', restInterval); if (running && restReminderEnabled) { stopReminderTimers(); startReminderTimers(); } });

function startReminderTimers() {
  stopReminderTimers();
  if (waterReminderEnabled) waterTimer = setInterval(() => showReminderToast('water', '💧', t('settings.water')), waterInterval * 60 * 1000);
  if (restReminderEnabled) restTimer = setInterval(() => showReminderToast('rest', '😌', t('settings.rest')), restInterval * 60 * 1000);
}
function stopReminderTimers() { if (waterTimer) clearInterval(waterTimer); if (restTimer) clearInterval(restTimer); waterTimer = null; restTimer = null; }

function showReminderToast(id, icon, text) {
  const host = $('#reminderToasts');
  if (!host) return;
  if (host.querySelector(`[data-rid="${id}"]`)) return;
  const el = document.createElement('div');
  el.className = 'reminder-toast';
  el.dataset.rid = id;
  el.innerHTML = `<div class="reminder-check"></div><span class="reminder-text">${icon} ${text}</span>`;
  el.querySelector('.reminder-check').addEventListener('click', () => {
    el.classList.add('checked');
    setTimeout(() => { el.classList.add('removing'); setTimeout(() => el.remove(), 400); }, 350);
  });
  host.appendChild(el);
}

let canvasResizeRetries = 0;
function resizeCanvas(){
  if (!canvas) return;
  const rect = canvas.getBoundingClientRect();
  if (!rect.width || !rect.height) {
    if (canvasResizeRetries < 10) { canvasResizeRetries++; requestAnimationFrame(resizeCanvas); }
    return;
  }
  canvasResizeRetries = 0;
  canvas.style.width = rect.width + 'px';
  canvas.style.height = rect.height + 'px';
  const dpr = Math.min(window.devicePixelRatio || 1, 2); canvas.width = Math.max(1, Math.round(rect.width * dpr)); canvas.height = Math.max(1, Math.round(rect.height * dpr)); canvasCtx.setTransform(dpr, 0, 0, dpr, 0, 0); drawGraph(); }
function yForHz(hz, h) { const range = Math.max(1, scaleMax - scaleMin); return h - ((hz - scaleMin) / range) * h; }
function interpolateGaps(data, maxGap) { const result = data.map(p => ({ t: p.t, v: p.v })); let i = 0; while (i < result.length) { if (result[i].v == null) { let j = i; while (j < result.length && result[j].v == null) j++; const gapLen = j - i; if (i > 0 && j < result.length && gapLen <= maxGap) { const v1 = result[i-1].v, v2 = result[j].v, t1 = result[i-1].t, t2 = result[j].t, span = t2 - t1 || 1; for (let k = i; k < j; k++) result[k].v = v1 + (v2 - v1) * ((result[k].t - t1) / span); } i = j; } else i++; } return result; }
function getSegments(points) { const segments = []; let current = []; for (const p of points) { if (p.y == null) { if (current.length > 0) { segments.push(current); current = []; } } else current.push(p); } if (current.length > 0) segments.push(current); return segments; }
function strokeSmoothPath(ctx, seg) { if (seg.length < 2) { if (seg.length === 1) { ctx.beginPath(); ctx.arc(seg[0].x, seg[0].y, ctx.lineWidth / 1.6, 0, Math.PI*2); ctx.fillStyle = ctx.strokeStyle; ctx.fill(); } return; } ctx.beginPath(); ctx.moveTo(seg[0].x, seg[0].y); for (let i = 1; i < seg.length - 1; i++) { const xc = (seg[i].x + seg[i+1].x) / 2, yc = (seg[i].y + seg[i+1].y) / 2; ctx.quadraticCurveTo(seg[i].x, seg[i].y, xc, yc); } const last = seg[seg.length - 1]; ctx.lineTo(last.x, last.y); ctx.stroke(); }
function fillSmoothArea(ctx, seg, h, baseColor) { if (seg.length < 2) return; ctx.beginPath(); ctx.moveTo(seg[0].x, seg[0].y); for (let i = 1; i < seg.length - 1; i++) { const xc = (seg[i].x + seg[i+1].x) / 2, yc = (seg[i].y + seg[i+1].y) / 2; ctx.quadraticCurveTo(seg[i].x, seg[i].y, xc, yc); } const last = seg[seg.length - 1]; ctx.lineTo(last.x, last.y); ctx.lineTo(last.x, h); ctx.lineTo(seg[0].x, h); ctx.closePath(); const grad = ctx.createLinearGradient(0, 0, 0, h); grad.addColorStop(0, hexToRgba(baseColor, 0.35)); grad.addColorStop(0.7, hexToRgba(baseColor, 0.1)); grad.addColorStop(1, hexToRgba(baseColor, 0)); ctx.fillStyle = grad; ctx.fill(); }

function drawGraph(){
  if (!canvasCtx) return;
  const w = canvas.clientWidth, h = canvas.clientHeight;
  if (w < 10 || h < 10) {
    if (!drawGraph.retryScheduled) {
      drawGraph.retryScheduled = true;
      requestAnimationFrame(() => { drawGraph.retryScheduled = false; resizeCanvas(); drawGraph(); });
    }
    return;
  }
  canvasCtx.clearRect(0, 0, w, h);
  const graphW = Math.max(1, w - LABEL_WIDTH);
  const theme = document.documentElement.dataset.theme || 'sage';
  const isDark = document.documentElement.dataset.mode === 'dark' || theme === 'dark';
  canvasCtx.fillStyle = isDark ? '#1E1E1E' : '#FFFFFF';
  canvasCtx.fillRect(0, 0, w, h);
  if (showZones) {
    const zones = [
      { key: 'male', low: 85, high: 145, color: zoneColors.male, label: t('graph.zone.male') },
      { key: 'andro', low: 145, high: 165, color: zoneColors.andro, label: t('graph.zone.andro') },
      { key: 'female', low: 165, high: 270, color: zoneColors.female, label: t('graph.zone.female') }
    ];
    zones.forEach(z => {
      const vis = zoneVisibility[z.key];
      if (vis <= 0.005) return;
      const zLow = Math.max(z.low, scaleMin), zHigh = Math.min(z.high, scaleMax); if (zHigh <= zLow) return;
      const zTop = yForHz(zHigh, h), zBot = yForHz(zLow, h);
      canvasCtx.fillStyle = zoneFillColor(z.color, vis); canvasCtx.fillRect(0, zTop, graphW, zBot - zTop);
      canvasCtx.strokeStyle = zoneBorderColor(z.color, vis); canvasCtx.lineWidth = 1; canvasCtx.setLineDash([3, 3]);
      canvasCtx.beginPath(); canvasCtx.moveTo(0, zTop); canvasCtx.lineTo(graphW, zTop); canvasCtx.moveTo(0, zBot); canvasCtx.lineTo(graphW, zBot); canvasCtx.stroke(); canvasCtx.setLineDash([]);
      const topHz = Math.min(z.high, scaleMax);
      canvasCtx.font = '400 9.5px Manrope, sans-serif'; canvasCtx.fillStyle = zoneBorderColor(z.color, vis); canvasCtx.textAlign = 'left'; canvasCtx.textBaseline = 'top'; canvasCtx.fillText(z.label, 10, yForHz(topHz, h) + 4);
    });
  }
  const targetVis = zoneVisibility.target;
  if (targetVis > 0.005) {
    const top = yForHz(targetHigh, h), bottom = yForHz(targetLow, h);
    canvasCtx.fillStyle = zoneFillColor(zoneColors.target, targetVis); canvasCtx.fillRect(0, top, graphW, Math.max(0, bottom - top));
    canvasCtx.strokeStyle = zoneBorderColor(zoneColors.target, targetVis); canvasCtx.lineWidth = 1.5; canvasCtx.setLineDash([4, 6]);
    canvasCtx.beginPath(); canvasCtx.moveTo(0, top); canvasCtx.lineTo(graphW, top); canvasCtx.moveTo(0, bottom); canvasCtx.lineTo(graphW, bottom); canvasCtx.stroke(); canvasCtx.setLineDash([]);
    const midY = (top + bottom) / 2;
    const label = t('graph.zone.target');
    canvasCtx.font = '400 9.5px Manrope, sans-serif';
    canvasCtx.textAlign = 'right'; canvasCtx.textBaseline = 'middle';
    const labelX = graphW - 8, metrics = canvasCtx.measureText(label);
    canvasCtx.fillStyle = zoneBorderColor(zoneColors.target, targetVis);
    canvasCtx.fillText(label, labelX, midY);
  }
  const now = performance.now(), windowStart = now - HISTORY_WINDOW_MS, cutoff = now - HISTORY_WINDOW_MS * 1.6;
  while (pitchHistory.length > 0 && pitchHistory[0].t < cutoff) pitchHistory.shift();
  const visible = pitchHistory.filter(p => p.t >= windowStart), filled = interpolateGaps(visible, 8);
  const points = filled.map(p => ({ x: ((p.t - windowStart) / HISTORY_WINDOW_MS) * graphW, y: p.v == null ? null : yForHz(p.v, h) }));
  const segments = getSegments(points);
  const lw = lineThickness, lc = lineColor;
  if (graphStyle === 'line') {
    canvasCtx.lineWidth = lw; canvasCtx.lineCap = 'round'; canvasCtx.lineJoin = 'round'; canvasCtx.strokeStyle = lc;
    for (const seg of segments) strokeSmoothPath(canvasCtx, seg);
  } else if (graphStyle === 'area') {
    for (const seg of segments) fillSmoothArea(canvasCtx, seg, h, lc);
    canvasCtx.lineWidth = lw; canvasCtx.lineCap = 'round'; canvasCtx.lineJoin = 'round'; canvasCtx.strokeStyle = lc;
    for (const seg of segments) strokeSmoothPath(canvasCtx, seg);
  } else if (graphStyle === 'glow') {
    canvasCtx.save(); canvasCtx.shadowColor = lc; canvasCtx.shadowBlur = 14; canvasCtx.lineWidth = lw + 0.3; canvasCtx.lineCap = 'round'; canvasCtx.lineJoin = 'round'; canvasCtx.strokeStyle = lc;
    for (const seg of segments) strokeSmoothPath(canvasCtx, seg); canvasCtx.restore();
    canvasCtx.lineWidth = lw; canvasCtx.lineCap = 'round'; canvasCtx.lineJoin = 'round'; canvasCtx.strokeStyle = lc;
    for (const seg of segments) strokeSmoothPath(canvasCtx, seg);
  }
}

function rmsOf(buf){let s=0;for(let i=0;i<buf.length;i++)s+=buf[i]*buf[i];return Math.sqrt(s/buf.length)}

function isVoiceLike(byteFreqData, sampleRate, fftSize) {
  const binHz = sampleRate / fftSize;
  let voiceBand = 0, totalBand = 0;
  for (let i = 2; i < byteFreqData.length; i++) {
    const freq = i * binHz;
    const e = byteFreqData[i] * byteFreqData[i];
    totalBand += e;
    if (freq >= 80 && freq <= 1200) voiceBand += e;
  }
  if (totalBand < 1) return false;
  return (voiceBand / totalBand) >= 0.28;
}

function detectPitch(buf, sampleRate){
  const length = buf.length;
  if (length < 32 || !Number.isFinite(sampleRate) || sampleRate <= 0) return null;
  const minHz = 60, maxHz = 450;
  const minLag = Math.max(2, Math.floor(sampleRate / maxHz));
  const maxLag = Math.min(Math.floor(sampleRate / minHz), Math.floor(length * 0.45));
  if (maxLag <= minLag + 2) return null;
  if (!pitchDifferenceBuffer || pitchDifferenceBuffer.length !== maxLag + 1) { pitchDifferenceBuffer = new Float32Array(maxLag + 1); pitchNormalizedBuffer = new Float32Array(maxLag + 1); }
  const difference = pitchDifferenceBuffer, normalized = pitchNormalizedBuffer;
  difference.fill(0); normalized.fill(0);
  let mean = 0;
  for (let i = 0; i < length; i++) mean += buf[i];
  mean /= length;
  let energy = 0;
  for (let i = 0; i < length; i++) {
    const centered = buf[i] - mean;
    energy += centered * centered;
  }
  const rms = Math.sqrt(energy / length);
  if (rms < 0.003) return null;

  for (let lag = 1; lag <= maxLag; lag++) {
    let sum = 0;
    const limit = length - lag;
    for (let i = 0; i < limit; i++) {
      const a = buf[i] - mean;
      const b = buf[i + lag] - mean;
      const delta = a - b;
      sum += delta * delta;
    }
    difference[lag] = sum;
  }

  let runningSum = 0;
  normalized[0] = 1;
  for (let lag = 1; lag <= maxLag; lag++) {
    runningSum += difference[lag];
    normalized[lag] = runningSum > 0 ? difference[lag] * lag / runningSum : 1;
  }

  const threshold = 0.18;
  let selectedLag = -1;
  for (let lag = minLag; lag <= maxLag; lag++) {
    if (normalized[lag] < threshold) {
      while (lag < maxLag && normalized[lag + 1] < normalized[lag]) lag++;
      selectedLag = lag;
      break;
    }
  }

  if (selectedLag < 0) {
    let bestValue = Infinity;
    for (let lag = minLag; lag <= maxLag; lag++) {
      if (normalized[lag] < bestValue) {
        bestValue = normalized[lag];
        selectedLag = lag;
      }
    }
    if (selectedLag < 0 || bestValue > 0.38) return null;
  }

  const left = normalized[selectedLag - 1] ?? normalized[selectedLag];
  const center = normalized[selectedLag];
  const right = normalized[selectedLag + 1] ?? center;
  const denominator = left - 2 * center + right;
  let shift = 0;
  if (Math.abs(denominator) > 1e-9) {
    shift = Math.max(-0.5, Math.min(0.5, 0.5 * (left - right) / denominator));
  }

  const hz = sampleRate / (selectedLag + shift);
  const confidence = Math.max(0, Math.min(1, 1 - center));
  if (!Number.isFinite(hz) || hz < minHz || hz > maxHz || confidence < 0.42) return null;
  return { hz, confidence, rms };
}

function computeResonance(byteFreqData, sampleRate, fftSize) {
  let num = 0, den = 0; const binHz = sampleRate / fftSize;
  for (let i = 2; i < byteFreqData.length; i++) { const freq = i * binHz; if (freq < 150 || freq > 4000) continue; const mag = byteFreqData[i]; num += freq * mag; den += mag; }
  if (den < 1) return 0; const centroid = num / den; return Math.max(0, Math.min(1, (centroid - 700) / 1800));
}

function stopTracks(){ if(stream){stream.getTracks().forEach(t=>t.stop());stream=null} if(audioCtx){audioCtx.close().catch(()=>{});audioCtx=null} analyser=null; sourceNode=null; monitorGain=null; freqData=null; audioBuffer=null; }

function pushSample(now) { if (now - lastDisplaySample < SAMPLE_INTERVAL_MS) return; lastDisplaySample = now; pitchHistory.push({ t: now, v: smoothPitch }); if (pitchHistory.length > MAX_HISTORY_POINTS) pitchHistory.shift(); }

function audioLoop() {
  if (!running || !session || !analyser || !audioCtx) {
    rafId = 0;
    return;
  }
  const now = performance.now();
  if (now - lastAudioProcessAt < 30) {
    rafId = requestAnimationFrame(audioLoop);
    return;
  }
  lastAudioProcessAt = now;
  if (audioCtx.state === 'suspended' && now - lastAudioResumeAttemptAt > 1500) {
    lastAudioResumeAttemptAt = now;
    audioCtx.resume().catch(error => console.debug('AudioContext resume while recording:', error));
  }
  try {
    if (typeof analyser.getFloatTimeDomainData === 'function') {
      analyser.getFloatTimeDomainData(audioBuffer);
    } else {
      const bytes = new Uint8Array(audioBuffer.length);
      analyser.getByteTimeDomainData(bytes);
      for (let i = 0; i < bytes.length; i++) audioBuffer[i] = (bytes[i] - 128) / 128;
    }
    analyser.getByteFrequencyData(freqData);
  } catch (audioError) {
    console.warn('Audio analysis frame failed:', audioError);
    rafId = requestAnimationFrame(audioLoop);
    return;
  }
  const dt = Math.min(0.12, Math.max(0, (now - session.lastTick) / 1000)); session.lastTick = now; session.elapsed += dt;
  if (session.elapsed >= SESSION_MAX_SEC && !session.maxedOut) {
    session.elapsed = SESSION_MAX_SEC;
    session.maxedOut = true;
    stopMic(true);
    showToast(t('sessionMaxed.text'));
    return;
  }
  if (session.elapsed - (session.lastBreakReminder || 0) > 1200) {
    session.lastBreakReminder = session.elapsed;
    showToast(t('breakReminder.text'));
  }
  const resonance = computeResonance(freqData, audioCtx.sampleRate, analyser.fftSize); session.resonanceSum += resonance; session.resonanceCount++;
  const rFill = $('#resonanceFill'), rVal = $('#resonanceValue'); if (rFill) rFill.style.width = Math.round(resonance * 100) + '%'; if (rVal) rVal.textContent = Math.round(resonance * 100) + '%';
  const voiceLike = isVoiceLike(freqData, audioCtx.sampleRate, analyser.fftSize);
  const detected = detectPitch(audioBuffer, audioCtx.sampleRate);
  if (running && detected && detected.rms > 0.25 && lastDetectedHz != null && Math.abs(detected.hz - lastDetectedHz) > 100 && Date.now() - lastStrainWarningAt > 60000) {
    const warning = $('#strainWarning');
    if (warning) {
      warning.textContent = t('strainWarning.text');
      warning.classList.add('show');
      clearTimeout(strainWarningTimer);
      strainWarningTimer = setTimeout(() => warning.classList.remove('show'), 5000);
    }
    lastStrainWarningAt = Date.now();
  }
  lastDetectedHz = detected ? detected.hz : null;
  if (detected) {
    rawPitchBuffer.push(detected.hz);
    if (rawPitchBuffer.length > MEDIAN_WINDOW) rawPitchBuffer.shift();
    const sortedPitches = rawPitchBuffer.slice().sort((a, b) => a - b);
    const medianHz = sortedPitches[Math.floor(sortedPitches.length / 2)];
    if (smoothPitch == null) smoothPitch = medianHz;
    else {
      const difference = medianHz - smoothPitch;
      const delta = Math.abs(difference);
      const response = graphResponse === 'instant' ? 0.92 : 0.48;
      const alpha = response;
      const maxStep = Math.max(1.2, (graphResponse === 'instant' ? 1000 : graphResponse === 'sharp' ? 240 : 70) * dt);
      const filteredStep = Math.max(-maxStep, Math.min(maxStep, difference * alpha));
      smoothPitch += filteredStep;
    }
    
    lastValidAt = now; 
    if (now - lastPitchAggregateAt >= 100) {
      session.allPitches.push(smoothPitch); session.pitchSum += smoothPitch; session.pitchCount++;
      lastPitchAggregateAt = now;
    }
    if (smoothPitch < session.minPitch) session.minPitch = smoothPitch;
    if (smoothPitch > session.maxPitch) session.maxPitch = smoothPitch;
    const inTarget = showTarget && smoothPitch >= targetLow && smoothPitch <= targetHigh;
    if (inTarget) session.inTarget += dt;
    const hzBadge = $('#hzBadge'); if (hzBadge) { hzBadge.textContent = `${Math.round(smoothPitch)} Hz`; hzBadge.style.color = inTarget ? 'var(--success)' : 'var(--text)'; }
    const pq = $('#pitchQuality'); if (pq) pq.textContent = inTarget ? '· ' + t('graph.inTarget') : '· ' + t('graph.outTarget');
  } else {
    if (now - lastValidAt > 500) { smoothPitch = null; rawPitchBuffer = []; const hzBadge = $('#hzBadge'); if (hzBadge) { hzBadge.textContent = '— Hz'; hzBadge.style.color = 'var(--text)'; } const pq = $('#pitchQuality'); if (pq) pq.textContent = '· ' + t('graph.waiting'); }
  }
  pushSample(now);
  $('#elapsedValue').textContent = fmtTime(session.elapsed);
  if (showTarget) $('#inTargetValue').textContent = fmtTime(session.inTarget);
  const avgEl = $('#avgPitchValue');
  if (avgEl) { avgEl.textContent = session.pitchCount ? Math.round(session.pitchSum / session.pitchCount) : '—'; }
  if (session.frameCount == null) session.frameCount = 0;
  session.frameCount++;
  if (session.frameCount <= 5) { resizeCanvas(); drawGraph(); }
  if (now - lastFrameAt >= 30) {
    drawGraph();
    lastFrameAt = now;
  }
  rafId = requestAnimationFrame(audioLoop);
}

function resampleMonoAudio(input, inputRate, outputRate = 44100) {
  if (inputRate === outputRate) return input;
  const outputLength = Math.max(1, Math.floor(input.length * outputRate / inputRate));
  const output = new Float32Array(outputLength);
  const ratio = inputRate / outputRate;
  for (let i = 0; i < outputLength; i++) {
    const position = i * ratio;
    const left = Math.floor(position);
    const right = Math.min(left + 1, input.length - 1);
    const fraction = position - left;
    output[i] = input[left] * (1 - fraction) + input[right] * fraction;
  }
  return output;
}

async function ensureMp3Encoder() {
  if (window.lamejs?.Mp3Encoder) return window.lamejs;
  if (!ensureMp3Encoder.promise) {
    ensureMp3Encoder.promise = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/lamejs@1.2.1/lame.min.js';
      script.onload = () => window.lamejs?.Mp3Encoder ? resolve(window.lamejs) : reject(new Error('MP3 encoder unavailable'));
      script.onerror = () => reject(new Error('MP3 encoder could not be loaded'));
      document.head.appendChild(script);
    });
  }
  return ensureMp3Encoder.promise;
}

async function encodeMp3Blob(inputBlob) {
  if (typeof Worker === 'undefined') throw new Error('Web Worker недоступен');
  const DecodeContext = window.AudioContext || window.webkitAudioContext;
  if (!DecodeContext) throw new Error('Audio decoding is not supported');
  const decodeContext = new DecodeContext();
  try {
    const decoded = await decodeContext.decodeAudioData(await inputBlob.arrayBuffer());
    const mono = new Float32Array(decoded.length);
    const channelCount = Math.max(1, decoded.numberOfChannels);
    for (let channel = 0; channel < channelCount; channel++) {
      const data = decoded.getChannelData(channel);
      for (let i = 0; i < data.length; i++) mono[i] += data[i] / channelCount;
    }
    const samples = resampleMonoAudio(mono, decoded.sampleRate, 44100);
    const workerSource = `importScripts('https://cdn.jsdelivr.net/npm/lamejs@1.2.1/lame.min.js');
onmessage = function(event) {
  try {
    const samples = new Float32Array(event.data.samples);
    const encoder = new lamejs.Mp3Encoder(1, 44100, 64);
    const chunks = [];
    const frameSize = 1152;
    for (let offset = 0; offset < samples.length; offset += frameSize) {
      const length = Math.min(frameSize, samples.length - offset);
      const pcm = new Int16Array(length);
      for (let i = 0; i < length; i++) {
        const sample = Math.max(-1, Math.min(1, samples[offset + i]));
        pcm[i] = sample < 0 ? Math.round(sample * 32768) : Math.round(sample * 32767);
      }
      const encoded = encoder.encodeBuffer(pcm);
      if (encoded && encoded.length) chunks.push(new Uint8Array(encoded));
    }
    const flushed = encoder.flush();
    if (flushed && flushed.length) chunks.push(new Uint8Array(flushed));
    const total = chunks.reduce((sum, chunk) => sum + chunk.length, 0);
    const output = new Uint8Array(total);
    let position = 0;
    for (const chunk of chunks) { output.set(chunk, position); position += chunk.length; }
    postMessage({ buffer: output.buffer }, [output.buffer]);
  } catch (error) { postMessage({ error: error && error.message ? error.message : String(error) }); }
};`;
    const workerBlob = new Blob([workerSource], { type: 'text/javascript' });
    const workerUrl = URL.createObjectURL(workerBlob);
    const worker = new Worker(workerUrl);
    try {
      return await new Promise((resolve, reject) => {
        worker.onmessage = event => {
          if (event.data?.error) reject(new Error(event.data.error));
          else resolve(new Blob([event.data.buffer], { type: 'audio/mpeg' }));
          worker.terminate();
          URL.revokeObjectURL(workerUrl);
        };
        worker.onerror = error => { worker.terminate(); URL.revokeObjectURL(workerUrl); reject(error); };
        worker.postMessage({ samples: samples.buffer }, [samples.buffer]);
      });
    } catch (error) {
      worker.terminate();
      URL.revokeObjectURL(workerUrl);
      throw error;
    }
  } finally {
    try { await decodeContext.close(); } catch (_) {}
  }
}

async function attachSessionAudioToPayload(payload, audioBlob) {
  if (!audioBlob) return { uploaded: false, path: null, failed: false };
  const extension = audioBlob.type === 'audio/mpeg' ? 'mp3' : audioBlob.type.includes('mp4') ? 'm4a' : 'webm';
  const path = `users/${currentUser.uid}/sessions/${payload.rewardId}.${extension}`;
  try {
    const fileRef = storageRef(storage, path);
    await uploadBytes(fileRef, audioBlob, { contentType: audioBlob.type || 'audio/webm', cacheControl: 'private,max-age=31536000' });
    payload.audioPath = path;
    payload.audioFormat = extension;
    return { uploaded: true, path, failed: false };
  } catch (error) {
    console.warn('Session audio upload failed:', error);
    return { uploaded: false, path: null, failed: true };
  }
}
const audioStore = (() => {
  let databasePromise;
  function openDB() {
    if (databasePromise) return databasePromise;
    databasePromise = new Promise((resolve, reject) => {
      const request = indexedDB.open('otklik-audio', 1);
      request.onupgradeneeded = () => {
        const dbInstance = request.result;
        if (!dbInstance.objectStoreNames.contains('recordings')) dbInstance.createObjectStore('recordings', { keyPath: 'id' });
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('IndexedDB unavailable'));
    });
    return databasePromise;
  }
  async function run(mode, action) {
    const dbInstance = await openDB();
    return new Promise((resolve, reject) => {
      const tx = dbInstance.transaction('recordings', mode);
      const store = tx.objectStore('recordings');
      let result;
      try { result = action(store); } catch (error) { reject(error); return; }
      tx.oncomplete = () => resolve(result?.result);
      tx.onerror = () => reject(tx.error || new Error('Audio storage failed'));
      tx.onabort = () => reject(tx.error || new Error('Audio storage aborted'));
    });
  }
  return {
    openDB,
    async putAudio(id, blob, mime, duration, date) { await run('readwrite', store => store.put({ id: String(id), blob, mime, duration, date })); },
    async getAudio(id) {
      const dbInstance = await openDB();
      return new Promise((resolve, reject) => {
        const request = dbInstance.transaction('recordings', 'readonly').objectStore('recordings').get(String(id));
        request.onsuccess = () => resolve(request.result ? { blob: request.result.blob, mime: request.result.mime } : null);
        request.onerror = () => reject(request.error);
      });
    },
    async hasAudio(id) { return !!(await this.getAudio(id)); },
    async deleteAudio(id) { await run('readwrite', store => store.delete(String(id))); },
    async clearAll() { await run('readwrite', store => store.clear()); }
  };
})();

async function getPrivateSessionAudioUrl(session) {
  if (!session || !currentUser) return null;
  const local = await audioStore.getAudio(session.id);
  if (local?.blob) return URL.createObjectURL(local.blob);
  if (!session.audioPath) return null;
  const expectedPrefix = `users/${currentUser.uid}/sessions/`;
  if (!session.audioPath.startsWith(expectedPrefix)) throw new Error('Недопустимый путь аудиозаписи');
  const blob = await getBlob(storageRef(storage, session.audioPath));
  return URL.createObjectURL(blob);
}

async function startMic() {
  if (running || isStarting || isStopping) return;
  const micButton = $('#micBtn');
  if (!navigator.mediaDevices?.getUserMedia) {
    showToast(t('toast.needHttps'));
    return;
  }

  isStarting = true;
  if (micButton) {
    micButton.disabled = true;
    micButton.textContent = currentLang === 'ru' ? 'Подключаем микрофон…' : 'Connecting microphone…';
    micButton.setAttribute('aria-busy', 'true');
  }

  let acquiredStream = null;
  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) throw new Error('Web Audio API недоступен');

    if (audioCtx && audioCtx.state !== 'closed') {
      try { await audioCtx.close(); } catch (_) {}
    }
    audioCtx = new AudioContextClass({ latencyHint: 'interactive' });

    const initialResume = audioCtx.resume().catch(error => {
      console.debug('Initial AudioContext resume deferred:', error);
    });

    acquiredStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
        channelCount: 1
      }
    });
    stream = acquiredStream;

    if (audioCtx.state !== 'running') {
      await audioCtx.resume().catch(resumeError => {
        console.warn('AudioContext resume retry failed:', resumeError);
      });
    }

    sourceNode = audioCtx.createMediaStreamSource(stream);
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = audioCtx.sampleRate > 60000 ? 4096 : 2048;
    analyser.smoothingTimeConstant = 0.12;
    sourceNode.connect(analyser);

    monitorGain = audioCtx.createGain();
    monitorGain.gain.value = 0;
    analyser.connect(monitorGain);
    monitorGain.connect(audioCtx.destination);

    audioBuffer = new Float32Array(analyser.fftSize);
    freqData = new Uint8Array(analyser.frequencyBinCount);

    sessionRecorder = null;
    sessionChunks = [];
    try {
      if (typeof MediaRecorder !== 'undefined') {
        const mime = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
          ? 'audio/webm;codecs=opus'
          : (MediaRecorder.isTypeSupported('audio/mp4') ? 'audio/mp4' : '');
        sessionRecorder = new MediaRecorder(stream, mime ? { mimeType: mime, audioBitsPerSecond: 128000 } : undefined);
        sessionRecorder.ondataavailable = event => {
          if (event.data?.size > 0) sessionChunks.push(event.data);
        };
        sessionRecorder.start(1000);
        clearTimeout(audioMaxTimer);
        const recorderForLimit = sessionRecorder;
        audioMaxTimer = setTimeout(() => {
          if (recorderForLimit === sessionRecorder && recorderForLimit.state === 'recording' && running) {
            try { recorderForLimit.stop(); } catch (recordError) { console.warn('Audio recording limit reached:', recordError); }
          }
        }, AUDIO_MAX_SEC * 1000);
      }
    } catch (recorderError) {
      console.warn('Audio recording unavailable; live voice analysis will continue:', recorderError);
      sessionRecorder = null;
      sessionChunks = [];
    }

    running = true;
    lastDetectedHz = null;
    $('#voiceTiredBtn')?.classList.add('show');
    session = {
      startedAt: Date.now(),
      elapsed: 0,
      inTarget: 0,
      mode: activeMode,
      lastTick: performance.now(),
      allPitches: [],
      pitchSum: 0,
      pitchCount: 0,
      resonanceSum: 0,
      resonanceCount: 0,
      minPitch: Infinity,
      maxPitch: 0
    };

    smoothPitch = null;
    rawPitchBuffer = [];
    lastValidAt = 0;
    lastFrameAt = 0;
    lastAudioProcessAt = 0;
    lastAudioResumeAttemptAt = 0;
    lastDisplaySample = 0;
    lastPitchAggregateAt = 0;
    pitchHistory = [];

    if (micButton) {
      micButton.textContent = t('mic.finish');
      micButton.disabled = false;
      micButton.removeAttribute('aria-busy');
    }
    $('#elapsedStat')?.classList.add('recording');
    $('#graphPlaceholder')?.classList.add('hidden');
    $('#graphWrap')?.classList.add('recording');

    resizeCanvas();
    drawGraph();
    startReminderTimers();
    cancelAnimationFrame(rafId);
    await audioCtx.resume().catch(() => {});
    rafId = requestAnimationFrame(audioLoop);
  } catch (error) {
    console.error('Microphone start failed:', error);
    if (acquiredStream) acquiredStream.getTracks().forEach(track => track.stop());
    if (stream === acquiredStream) stream = null;
    stopTracks();
    const messages = {
      NotAllowedError: 'Разреши доступ к микрофону в настройках браузера',
      PermissionDeniedError: 'Разреши доступ к микрофону в настройках браузера',
      NotFoundError: 'Микрофон не найден',
      NotReadableError: 'Микрофон занят другим приложением',
      SecurityError: 'Открой сайт по HTTPS и разреши доступ к микрофону'
    };
    showToast(messages[error?.name] || (error?.message || t('toast.noMic')));
    $('#graphPlaceholder')?.classList.remove('hidden');
    $('#graphWrap')?.classList.remove('recording');
  } finally {
    isStarting = false;
  setTimeout(() => { resizeCanvas(); drawGraph(); }, 300);
    if (micButton) {
      micButton.disabled = false;
      micButton.removeAttribute('aria-busy');
      if (!running) micButton.textContent = t('mic.start');
    }
  }
}
async function stopMic(showResult = true){
  if (!running || !session || isStopping) return;
  isStopping = true;
  const lockOverlay = $('#globalLockOverlay');
  if (lockOverlay) { lockOverlay.classList.add('active'); lockOverlay.setAttribute('aria-hidden', 'false'); }
  document.body.style.overflow = 'hidden';
  const finished = session;
  session = null;
  running = false;
  $('#voiceTiredBtn')?.classList.remove('show');
  lastDetectedHz = null;
  clearTimeout(strainWarningTimer);
  $('#strainWarning')?.classList.remove('show');
  clearTimeout(audioMaxTimer); audioMaxTimer = null; clearInterval(audioLoopTimer); audioLoopTimer = null; cancelAnimationFrame(rafId); rafId = 0; stopReminderTimers();
  $('#micBtn').textContent = t('mic.start');
  $('#elapsedStat').classList.remove('recording');
  const ph = $('#graphPlaceholder'); if (ph) ph.classList.remove('hidden');
  const gw = $('#graphWrap'); if (gw) gw.classList.remove('recording');
  const host = $('#reminderToasts'); if (host) host.innerHTML = '';

  let audioBlob = null, audioObjectUrl = null, audioFormat = 'webm';
  const recorderToFinish = sessionRecorder;
  if (recorderToFinish && recorderToFinish.state !== 'inactive') {
    await new Promise(resolve => {
      const previousOnStop = recorderToFinish.onstop;
      recorderToFinish.addEventListener('stop', () => { try { previousOnStop?.(); } catch (_) {} resolve(); }, { once: true });
      try { recorderToFinish.stop(); } catch (_) { resolve(); }
    });
  }
  if (sessionChunks.length) {
    $('#saveSessionBtn').textContent = currentLang === 'ru' ? 'Кодируем…' : 'Encoding…';
    try {
      const sourceBlob = new Blob(sessionChunks, { type: recorderToFinish?.mimeType || 'audio/webm' });
      audioBlob = sourceBlob;
      audioFormat = sourceBlob.type || 'audio/webm';
      audioObjectUrl = URL.createObjectURL(audioBlob);
      
    } catch (recordError) { console.warn('Audio finalization failed:', recordError); audioBlob = null; }
  }
  $('#saveSessionBtn').textContent = t('result.save');
  sessionRecorder = null; sessionChunks = []; stopTracks();

  const avg = finished.pitchCount ? finished.pitchSum / finished.pitchCount : null;
  const avgRes = finished.resonanceCount ? finished.resonanceSum / finished.resonanceCount : 0;
  const minP = isFinite(finished.minPitch) ? Math.round(finished.minPitch) : null;
  const maxP = finished.maxPitch ? Math.round(finished.maxPitch) : null;

  pendingSession = {
    rewardId: `${currentUser?.uid || 'guest'}_${Date.now()}_${Math.random().toString(36).slice(2,8)}`,
    date: new Date().toISOString(), mode: finished.mode,
    duration: Math.round(finished.elapsed),
    inTarget: Math.round(finished.inTarget), averagePitch: avg == null ? null : Math.round(avg),
    minPitch: minP, maxPitch: maxP,
    averageResonance: Math.round(avgRes * 100),
    audioBlob: audioBlob,
    audioObjectUrl: audioObjectUrl,
    audioFormat: audioFormat
  };
  drawGraph();

  if (showResult && pendingSession.duration >= 2) {
    $('#saveSessionBtn').disabled = false;
    const resultTargetEl = $('#resultTarget'), resultAvgEl = $('#resultAverage'), resultMinEl = $('#resultMin'), resultMaxEl = $('#resultMax');
    if (resultTargetEl) resultTargetEl.textContent = fmtShort(pendingSession.inTarget);
    if (resultAvgEl) resultAvgEl.textContent = pendingSession.averagePitch ?? '—';
    if (resultMinEl) resultMinEl.textContent = pendingSession.minPitch ?? '—';
    if (resultMaxEl) resultMaxEl.textContent = pendingSession.maxPitch ?? '—';
    const resultResonanceEl = $('#resultResonance');
    if (resultResonanceEl) resultResonanceEl.textContent = (pendingSession.averageResonance ?? 0) + '%';
    const resultCard = $('#resultTargetCard');
    if (resultCard) resultCard.style.display = showTarget ? '' : 'none';

    const insightEl = $('#resultInsight');
    const startDate = userData?.profile?.hrtStartDate;
    const today = new Date().toISOString().split('T')[0];
    const isFirstToday = userData?.lastPracticeDate !== today;
    if (startDate && isFirstToday) {
      const start = new Date(startDate + 'T00:00:00');
      const days = Math.max(1, Math.floor((new Date() - start) / 86400000) + 1);
      if (insightEl) { insightEl.textContent = t('result.insight', {days}); insightEl.style.display = 'block'; }
    } else if (insightEl) insightEl.style.display = 'none';

    const summaryEl = $('#resultSummary');
    if (summaryEl) {
      const pct = pendingSession.duration > 0 ? pendingSession.inTarget / pendingSession.duration * 100 : 0;
      const analysisLines = buildSessionAnalysis(pendingSession, showTarget, targetLow, targetHigh);
      const rangeTxt = (pendingSession.minPitch != null && pendingSession.maxPitch != null) ? `${pendingSession.minPitch}–${pendingSession.maxPitch} ${currentLang === 'ru' ? 'Гц' : 'Hz'}` : '—';
      summaryEl.innerHTML = `
        <div class="result-summary-row"><span>${t('summary.duration')}</span><strong>${fmtTime(pendingSession.duration)}</strong></div>
        ${showTarget ? `<div class="result-summary-row"><span>${t('summary.inTarget')}</span><strong>${fmtTime(pendingSession.inTarget)} · ${Math.round(pct)}%</strong></div>` : ''}
        <div class="result-summary-row"><span>${t('summary.avg')}</span><strong>${pendingSession.averagePitch ?? '—'} ${currentLang === 'ru' ? 'Гц' : 'Hz'}</strong></div>
        <div class="result-summary-row"><span>${t('summary.range')}</span><strong>${rangeTxt}</strong></div>
        <div class="result-summary-comment">${analysisLines.map(line => `<div class="analysis-line">${line}</div>`).join('')}</div>`;
      summaryEl.style.display = 'block';
    }

    renderResultAudioPlayer(pendingSession.audioObjectUrl || pendingSession.audioBase64, pendingSession.duration);
    openModal('resultModal');
  } else {
    if (pendingSession?.audioObjectUrl) URL.revokeObjectURL(pendingSession.audioObjectUrl);
    pendingSession = null;
  }
  isStopping = false;
  if (lockOverlay) { lockOverlay.classList.remove('active'); lockOverlay.setAttribute('aria-hidden', 'true'); }
  document.body.style.overflow = '';
}

function buildSessionAnalysis(s, showTarget, low, high) {
  if (s.averagePitch == null || s.minPitch == null || s.maxPitch == null) {
    return [t('summary.analysisNoData')];
  }
  const lines = [];
  const avg = s.averagePitch;
  const min = s.minPitch;
  const max = s.maxPitch;
  const range = max - min;
  if (showTarget) {
    if (avg < low) lines.push(t('summary.analysisBelow', {avg, low, high}));
    else if (avg > high) lines.push(t('summary.analysisAbove', {avg, low, high}));
    else lines.push(t('summary.analysisInTarget', {avg, low, high}));
  } else {
    lines.push(t('summary.analysisGeneric', {avg}));
  }
  if (range > 100) lines.push(t('summary.analysisRangeWide', {min, max, range}));
  else if (range < 30) lines.push(t('summary.analysisRangeNarrow', {min, max, range}));
  else lines.push(t('summary.analysisRangeBalanced', {min, max, range}));
  const res = s.averageResonance || 0;
  if (res < 30) lines.push(t('summary.analysisResonanceLow', {res}));
  else if (res > 65) lines.push(t('summary.analysisResonanceHigh', {res}));
  else lines.push(t('summary.analysisResonanceBalanced', {res}));
  return lines;
}

function renderResultAudioPlayer(audioSource, expectedDuration = 0) {
  const wrap = $('#resultAudioWrap'); if (!wrap) return;
  if (_resultAudio) { try { _resultAudio.pause(); } catch(e){} _resultAudio = null; }
  if (!audioSource) { wrap.innerHTML = ''; return; }
  const fmt = (seconds) => {
    if (!Number.isFinite(seconds) || seconds < 0) return '00:00';
    const s = Math.floor(seconds);
    return `${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;
  };
  wrap.innerHTML = `
    <div class="result-audio-player">
      <button class="result-play-btn" id="resultPlayBtn" type="button" aria-label="Play recording">▶</button>
      <div class="result-audio-info">
        <div class="result-audio-title">${t('result.audioTitle')}</div>
        <div class="result-audio-time" id="resultAudioTime">00:00 / ${fmt(expectedDuration)}</div>
        <div class="result-audio-progress" id="resultProgress"><span id="resultProgressFill"></span></div>
      </div>
      <button class="session-action-btn" id="resultDownloadAudioBtn" type="button" title="Download MP3" aria-label="Download audio">⬇</button>
    </div>`;
  const audio = new Audio();
  audio.preload = 'metadata';
  audio.src = audioSource;
  _resultAudio = audio;
  const btn = $('#resultPlayBtn'), timeEl = $('#resultAudioTime'), progEl = $('#resultProgress'), fillEl = $('#resultProgressFill');
  const getDuration = () => Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : expectedDuration;
  audio.addEventListener('loadedmetadata', () => { timeEl.textContent = `00:00 / ${fmt(getDuration())}`; });
  audio.addEventListener('durationchange', () => { timeEl.textContent = `${fmt(audio.currentTime)} / ${fmt(getDuration())}`; });
  audio.addEventListener('timeupdate', () => {
    timeEl.textContent = `${fmt(audio.currentTime)} / ${fmt(getDuration())}`;
    fillEl.style.width = (audio.currentTime / Math.max(0.01, getDuration()) * 100) + '%';
  });
  audio.addEventListener('ended', () => { btn.textContent = '▶'; fillEl.style.width = '0%'; timeEl.textContent = `00:00 / ${fmt(getDuration())}`; });
  btn.addEventListener('click', () => { if (audio.paused) { audio.play().then(() => { btn.textContent = '⏸'; }).catch(() => { btn.textContent = '▶'; }); } else { audio.pause(); btn.textContent = '▶'; } });
  progEl.addEventListener('click', (e) => { const rect = progEl.getBoundingClientRect(); const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)); if (getDuration() > 0) audio.currentTime = pct * getDuration(); });
  $('#resultDownloadAudioBtn')?.addEventListener('click', () => downloadAudioSource(audioSource, pendingSession?.audioFormat || 'mp3', pendingSession?.date));
}

async function downloadAudioSource(source, format = 'mp3', dateValue) {
  if (!source) return;
  try {
    let sourceBlob;
    if (source instanceof Blob) {
      sourceBlob = source;
    } else {
      const response = await fetch(source);
      if (!response.ok) throw new Error('Audio download failed');
      sourceBlob = await response.blob();
    }
    const mp3Blob = sourceBlob.type === 'audio/mpeg' ? sourceBlob : await encodeMp3Blob(sourceBlob);
    const href = URL.createObjectURL(mp3Blob);
    const link = document.createElement('a');
    link.href = href;
    link.download = `otklik-session-${dateValue?.split('T')[0] || 'audio'}.mp3`;
    document.body.appendChild(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(href), 60000);
    showToast(t('toast.downloaded'));
  } catch (error) {
    console.warn('MP3 conversion/download failed:', error);
    showToast(currentLang === 'ru' ? 'Не удалось преобразовать запись в MP3. Проверь подключение и попробуй ещё раз.' : 'Could not convert the recording to MP3. Check your connection and try again.');
  }
}


function healthChecklistKey() {
  const d = new Date();
  const day = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
  return `otklik_health_checklist_${day}`;
}
function shouldShowHealthChecklist() {
  if (localStorage.getItem(healthChecklistKey()) === '1') return false;
  const snoozeUntil = Number(sessionStorage.getItem('otklik_health_snooze_until') || 0);
  if (snoozeUntil > Date.now()) return false;
  if (snoozeUntil) sessionStorage.removeItem('otklik_health_snooze_until');
  return true;
}
function updateHealthChecklistButton() {
  const checks = $$('#healthChecklistModal .health-checklist-check');
  const button = $('#healthChecklistStart');
  if (button) button.disabled = !(checks.length === 3 && checks.every(check => check.checked));
}
$$('#healthChecklistModal .health-checklist-check').forEach(check => check.addEventListener('change', updateHealthChecklistButton));
$('#healthChecklistStart')?.addEventListener('click', () => {
  if ($('#healthChecklistStart')?.disabled) return;
  localStorage.setItem(healthChecklistKey(), '1');
  sessionStorage.removeItem('otklik_health_snooze_until');
  closeModal('healthChecklistModal');
  if (!running) startMic();
});
$('#healthChecklistSnooze')?.addEventListener('click', () => {
  sessionStorage.setItem('otklik_health_snooze_until', String(Date.now() + 2 * 60 * 60 * 1000));
  closeModal('healthChecklistModal');
});
$('#micBtn')?.addEventListener('click', () => {
  if (running) { stopMic(true); return; }
  if (isStarting || isStopping) return;
  if (shouldShowHealthChecklist()) {
    $$('#healthChecklistModal .health-checklist-check').forEach(check => { check.checked = false; });
    updateHealthChecklistButton();
    openModal('healthChecklistModal');
    return;
  }
  startMic();
});
function clearBreathingExercise() {
  if (breathingTimer) clearInterval(breathingTimer);
  breathingTimer = null;
  breathingElapsed = 0;
  $('#breathingCircle')?.classList.remove('inhale','exhale');
}
function closeVoiceTiredModal() {
  clearBreathingExercise();
  closeModal('voiceTiredModal');
}
function startBreathingExercise() {
  clearBreathingExercise();
  const circle = $('#breathingCircle');
  const phase = $('#breathingPhase');
  const countdown = $('#breathingCountdown');
  const cycle = $('#breathingCycle');
  const exercise = $('#breathingExercise');
  const done = $('#breathingDone');
  const finish = $('#voiceTiredFinish');
  if (!circle || !phase || !countdown || !cycle || !exercise || !done || !finish) return;
  exercise.style.display = '';
  done.style.display = 'none';
  finish.style.display = 'none';
  breathingElapsed = 0;
  const update = () => {
    countdown.textContent = String(Math.max(0, 30 - breathingElapsed));
    if (breathingElapsed >= 30) {
      clearBreathingExercise();
      exercise.style.display = 'none';
      done.style.display = 'block';
      finish.style.display = 'flex';
      return;
    }
    const cycleNumber = Math.floor(breathingElapsed / 6) + 1;
    const inhale = breathingElapsed % 6 < 3;
    phase.textContent = t(inhale ? 'voiceTired.inhale' : 'voiceTired.exhale');
    cycle.textContent = t('voiceTired.cycle', {n:cycleNumber,total:5});
    circle.classList.toggle('inhale', inhale);
    circle.classList.toggle('exhale', !inhale);
  };
  update();
  breathingTimer = setInterval(() => { breathingElapsed++; update(); }, 1000);
}
$('#voiceTiredBtn')?.addEventListener('click', async () => {
  if (running) await stopMic(false);
  openModal('voiceTiredModal');
  startBreathingExercise();
});
$('#voiceTiredSkip')?.addEventListener('click', closeVoiceTiredModal);
$('#voiceTiredFinish')?.addEventListener('click', closeVoiceTiredModal);
$('#voiceTiredModal')?.addEventListener('click', event => {
  if (event.target.id === 'voiceTiredModal') closeVoiceTiredModal();
});

$('#streakRepairBtn')?.addEventListener('click', restoreStreak);
$('#restoreStreakModalBtn')?.addEventListener('click', restoreStreak);
$('#closeStreakLossBtn')?.addEventListener('click', () => closeModal('streakLossModal'));
$('#streakLossModal')?.addEventListener('click', e => { if (e.target.id === 'streakLossModal') closeModal('streakLossModal'); });
$('#hideVoiceAgency')?.addEventListener('click', async () => {
  const el = document.querySelector('.voice-agency');
  if (!el || el.classList.contains('hide-out')) return;
  el.classList.add('hide-out');
  el.setAttribute('aria-hidden', 'true');
  if (currentUser) sessionStorage.setItem(`otklik_hide_agency_${currentUser.uid}`, '1');
});

function animateCoinReward(before, after, sourceRect) {
  const amount = Math.max(0, Number(after) - Number(before));
  const balanceEl = $('#coinBalance'), card = $('#coinCard');
  if (!balanceEl || amount <= 0) { updateCoinBalance(); return; }
  const target = balanceEl.getBoundingClientRect();
  const origin = sourceRect || target;
  const sx = origin.left + origin.width / 2, sy = origin.top + origin.height / 2;
  const tx = target.left + target.width / 2, ty = target.top + target.height / 2;
  balanceEl.textContent = Number.isInteger(before) ? String(before) : Number(before).toFixed(1);
  card?.classList.add('coin-reward-active');
  const particles = Math.min(8, Math.max(4, Math.ceil(amount / 8)));
  for (let i = 0; i < particles; i++) {
    const coin = document.createElement('span');
    coin.className = 'coin-flight'; coin.textContent = '✦';
    coin.style.left = `${sx - 11 + (Math.random() * 24 - 12)}px`;
    coin.style.top = `${sy - 11 + (Math.random() * 18 - 9)}px`;
    document.body.appendChild(coin);
    const dx = tx - parseFloat(coin.style.left), dy = ty - parseFloat(coin.style.top);
    const anim = coin.animate([
      { transform: 'translate(0,0) scale(.65) rotate(0deg)', opacity: 0 },
      { transform: `translate(${dx*.48}px,${dy*.48-28}px) scale(1) rotate(160deg)`, opacity: 1, offset: .45 },
      { transform: `translate(${dx}px,${dy}px) scale(.35) rotate(320deg)`, opacity: .1 }
    ], { duration: 820, delay: i * 65, easing: 'cubic-bezier(.2,.72,.2,1)' });
    anim.onfinish = () => coin.remove();
  }
  const plus = document.createElement('span');
  plus.className = 'coin-earned-float'; plus.textContent = `+${amount.toFixed(1).replace(/\.0$/, '')}`;
  plus.style.left = `${tx + 6}px`; plus.style.top = `${ty - 16}px`; document.body.appendChild(plus);
  setTimeout(() => plus.remove(), 1300);
  const started = performance.now(), duration = 900;
  const targetValue = Number(after);
  function tick(now) {
    const progress = Math.min(1, (now - started) / duration);
    const eased = 1 - Math.pow(1 - progress, 3);
    const value = Number(before) + (targetValue - Number(before)) * eased;
    balanceEl.textContent = Number.isInteger(targetValue) ? String(Math.round(value)) : value.toFixed(1);
    if (progress < 1) requestAnimationFrame(tick);
    else balanceEl.textContent = Number.isInteger(targetValue) ? String(targetValue) : targetValue.toFixed(1);
  }
  requestAnimationFrame(tick);
  setTimeout(() => card?.classList.remove('coin-reward-active'), 850);
}

$('#saveSessionBtn')?.addEventListener('click', async () => {
  if (!pendingSession || isSavingSession || !currentUser) return;
  const maxSessions = 30 + (Number(userData?.purchases?.extraSessionsBought || 0) * 30);
  if (lastSessionsCache.length >= maxSessions) { showToast(t('toast.sessionLimit')); return; }
  isSavingSession = true;
  const saveButton = $('#saveSessionBtn');
  const sourceRect = saveButton.getBoundingClientRect();
  const coinsBefore = Number(userData?.coins ?? 300);
  const sessionSnapshot = pendingSession;
  let sessionRef = null;
  saveButton.disabled = true;
  saveButton.textContent = currentLang === 'ru' ? 'Сохраняем…' : 'Saving…';
  try {
    const payload = { ...sessionSnapshot };
    const audioBlob = payload.audioBlob;
    delete payload.audioBlob; delete payload.audioObjectUrl; delete payload.audioBase64;
    payload.createdAt = serverTimestamp();
    sessionRef = await addDoc(collection(db, 'users', currentUser.uid, 'sessions'), payload);
    if (_resultAudio) { try { _resultAudio.pause(); } catch(e){} _resultAudio = null; }
    pendingSession = null;
    closeModal('resultModal');
    const blobUrl = sessionSnapshot?.audioObjectUrl;
    if (blobUrl) setTimeout(() => URL.revokeObjectURL(blobUrl), 60000);
    showToast(t('toast.sessionSaved'));

    const rewardId = payload.rewardId || sessionRef.id;
    const today = localDateKey();
    const yesterday = shiftDateKey(today, -1);
    let rewardCoinsBefore = Number(userData?.coins ?? coinsBefore);
    let rewardCoinsAfter = rewardCoinsBefore;
    let streakUpdate = null;
    await runTransaction(db, async transaction => {
      const userRef = doc(db, 'users', currentUser.uid);
      const userSnap = await transaction.get(userRef);
      if (!userSnap.exists()) throw new Error('User profile not found');
      const current = userSnap.data();
      rewardCoinsBefore = Number(current.coins ?? coinsBefore);
      const rewarded = Array.isArray(current.rewardedSessionIds) ? current.rewardedSessionIds : [];
      if (!rewarded.includes(rewardId)) {
        const earned = Math.round((Number(sessionSnapshot.duration || 0) * 0.02 + Number(sessionSnapshot.inTarget || 0) * 0.5) * 10) / 10;
        const nextRewarded = [...rewarded, rewardId].slice(-99);
        rewardCoinsAfter = Math.round((rewardCoinsBefore + earned) * 10) / 10;
        transaction.update(userRef, { coins: rewardCoinsAfter, rewardedSessionIds: nextRewarded });
      } else {
        rewardCoinsAfter = rewardCoinsBefore;
      }
      const currentDate = current.lastPracticeDate;
      if (currentDate !== today) {
        if (currentDate && currentDate !== yesterday && Number(current.streak || 0) > 0) {
          const broken = {
            previousStreak: Number(current.streak || 0),
            missedDate: currentDate,
            restoreUntil: today,
            restored: false
          };
          streakUpdate = { streak: 1, lastPracticeDate: today, streakBroken: broken };
        } else {
          const nextStreak = currentDate === yesterday ? Number(current.streak || 0) + 1 : 1;
          streakUpdate = { streak: nextStreak, lastPracticeDate: today };
        }
      }
      if (streakUpdate) transaction.update(userRef, streakUpdate);
    });
    const userRef = doc(db, 'users', currentUser.uid);
    await updateDoc(userRef, { coins: increment(15) });
    rewardCoinsAfter = Math.round((rewardCoinsAfter + 15) * 10) / 10;
    const refreshedUser = await getDoc(userRef);
    if (refreshedUser.exists()) userData = { ...userData, ...refreshedUser.data() };
    animateCoinReward(rewardCoinsBefore, Number(userData?.coins ?? rewardCoinsAfter), sourceRect);
    updateStreakCard();
    if (audioBlob && sessionRef) await audioStore.putAudio(sessionRef.id, audioBlob, audioBlob.type || sessionSnapshot.audioFormat || "audio/webm", sessionSnapshot.duration, sessionSnapshot.date);
    updateCoinBalance();
  } catch (e) {
    console.error('Session save failed:', e);
    showToast((t('toast.error') || 'Error') + ': ' + (e?.message || e));
  } finally {
    isSavingSession = false;
    saveButton.disabled = false;
    saveButton.textContent = t('result.save');
  }
});
$('#discardSessionBtn')?.addEventListener('click', () => {
  if (_resultAudio) { try { _resultAudio.pause(); } catch(e){} _resultAudio = null; }
  const blobUrl = pendingSession?.audioObjectUrl; if (blobUrl) URL.revokeObjectURL(blobUrl);
  closeModal('resultModal'); pendingSession = null;
});

$('#downloadReportBtn')?.addEventListener('click', async () => {
  if (!pendingSession) return;
  if (typeof html2canvas === 'undefined') { showToast(t('toast.error')); return; }
  const report = document.createElement('div');
  report.style.cssText = 'position:fixed;left:-9999px;top:0;width:640px;background:#ffffff;padding:40px;font-family:Manrope,sans-serif;color:#2D2D2D;box-sizing:border-box;';
  report.innerHTML = `
    <div style="text-align:center;margin-bottom:24px">
      <div style="font-size:48px;color:#4A7C59;line-height:1">✦</div>
      <div style="font-size:28px;font-weight:800;color:#4A7C59;letter-spacing:-1px;margin-top:6px">${t('app.name')}</div>
      <div style="font-size:13px;color:#8A8A8A;margin-top:4px">${t('result.title')}</div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px">
      <div style="text-align:center;padding:16px;background:#F2F2F0;border-radius:14px">
        <div style="font-size:11px;color:#8A8A8A;text-transform:uppercase;letter-spacing:.05em;font-weight:800">${t('summary.duration')}</div>
        <div style="font-size:22px;font-weight:800;color:#2D2D2D;margin-top:4px">${fmtTime(pendingSession.duration)}</div>
      </div>
      <div style="text-align:center;padding:16px;background:#F2F2F0;border-radius:14px">
        <div style="font-size:11px;color:#8A8A8A;text-transform:uppercase;letter-spacing:.05em;font-weight:800">${t('summary.avg')}</div>
        <div style="font-size:22px;font-weight:800;color:#4A7C59;margin-top:4px">${pendingSession.averagePitch ?? '—'} Hz</div>
      </div>
    </div>
    <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:16px">
      <div style="text-align:center;padding:16px;background:#F2F2F0;border-radius:14px">
        <div style="font-size:11px;color:#8A8A8A;text-transform:uppercase;letter-spacing:.05em;font-weight:800">${t('result.min')}</div>
        <div style="font-size:22px;font-weight:800;color:#2D2D2D;margin-top:4px">${pendingSession.minPitch ?? '—'} Hz</div>
      </div>
      <div style="text-align:center;padding:16px;background:#F2F2F0;border-radius:14px">
        <div style="font-size:11px;color:#8A8A8A;text-transform:uppercase;letter-spacing:.05em;font-weight:800">${t('result.max')}</div>
        <div style="font-size:22px;font-weight:800;color:#2D2D2D;margin-top:4px">${pendingSession.maxPitch ?? '—'} Hz</div>
      </div>
      ${showTarget ? `<div style="text-align:center;padding:16px;background:rgba(34,197,94,.08);border-radius:14px">
        <div style="font-size:11px;color:#22C55E;text-transform:uppercase;letter-spacing:.05em;font-weight:800">${t('result.inTarget')}</div>
        <div style="font-size:22px;font-weight:800;color:#22C55E;margin-top:4px">${fmtTime(pendingSession.inTarget)}</div>
      </div>` : ''}
    </div>
    <div style="text-align:center;font-size:11px;color:#8A8A8A;margin-top:20px;padding-top:16px;border-top:1px solid #E5E5E3">${new Date().toLocaleDateString()}</div>
  `;
  document.body.appendChild(report);
  try {
    const canvas = await html2canvas(report, { scale: 2, backgroundColor: '#ffffff' });
    const link = document.createElement('a');
    link.download = `otklik-session-${Date.now()}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
    showToast(t('toast.downloaded'));
  } catch (e) { showToast(t('toast.error')); }
  finally { report.remove(); }
});

function fmtTime(s){s=Math.max(0,Math.floor(s||0));return `${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`}
function fmtShort(s){s=Math.max(0,Math.round(s||0));return s<60?`${s}s`:`${Math.floor(s/60)}m`}

function renderStats(sessions) {
  const totalTarget = sessions.reduce((a, s) => a + (s.inTarget || 0), 0);
  const tt = $('#totalTarget'); if (tt) tt.textContent = Math.round(totalTarget / 60);
  const ts = $('#totalSessions'); if (ts) ts.textContent = sessions.length + ' ' + t('stats.sessionsSaved');
}

function renderRecent(sessions) {
  const host = $('#recentSessions'); if (!host) return;
  const countEl = $('#sessionsCount');
  if (countEl) {
    countEl.textContent = `${sessions.length}/30`;
    countEl.classList.toggle('full', sessions.length >= 30);
  }
  if (!sessions.length) { host.innerHTML = `<div class="card empty">${t('sessions.empty')}</div>`; return; }
  host.innerHTML = sessions.slice(0, 30).map(s => {
    const hasAudio = true;
    const icon = MODES[s.mode] ? (s.mode === 'fem' ? '✿' : s.mode === 'masc' ? '◈' : '〰') : '〰';
    const title = s.mode === 'masc' ? t('mode.masc') : t('mode.fem');
    return `<div class="session-item" data-session-id="${s.id}">
      <div class="session-symbol">${icon}</div>
      <div class="session-details">
        <strong>${title}</strong>
        <span>${new Date(s.date).toLocaleDateString()} · ${fmtTime(s.duration)}${showTarget ? ' · '+t('stats.inTarget')+': '+fmtShort(s.inTarget) : ''}</span>
      </div>
      <div class="session-actions">
        <button class="session-action-btn" data-action="play" data-id="${s.id}" title="Play" ${hasAudio ? '' : 'disabled'}>▶</button>
        <button class="session-action-btn" data-action="download" data-id="${s.id}" title="Download" ${hasAudio ? '' : 'disabled'}>⬇</button>
        <button class="session-action-btn delete" data-action="delete" data-id="${s.id}" title="Delete">🗑</button>
      </div>
    </div>`;
  }).join('') + (sessions.length >= 30 ? `<div class="session-limit-note full">${t('sessions.limit')}</div>` : '');
}

let _currentSessionAudio = null;
let _currentSessionAudioId = null;
$('#recentSessions')?.addEventListener('click', async (e) => {
  const btn = e.target.closest('[data-action]'); if (!btn) return;
  const action = btn.dataset.action, id = btn.dataset.id;
  const session = lastSessionsCache.find(s => s.id === id); if (!session) return;

  if (action === 'play') {
    if (_currentSessionAudio && _currentSessionAudioId === id) {
      _currentSessionAudio.pause();
      _currentSessionAudio = null;
      _currentSessionAudioId = null;
      btn.textContent = '▶';
      btn.classList.remove('playing');
      return;
    }
    if (_currentSessionAudio) {
      _currentSessionAudio.pause();
      _currentSessionAudio = null;
      _currentSessionAudioId = null;
    }
    document.querySelectorAll('.session-action-btn.playing').forEach(b => { b.textContent = '▶'; b.classList.remove('playing'); });
    let audioSource = session.audioUrl || session.audioBase64 || null;
    if (!audioSource) {
      try { audioSource = await getPrivateSessionAudioUrl(session); }
      catch (err) { showToast(t('toast.error')); return; }
    }
    if (!audioSource) return;
    const audio = new Audio(audioSource);
    _currentSessionAudio = audio;
    _currentSessionAudioId = id;
    btn.textContent = '⏸'; btn.classList.add('playing');
    audio.addEventListener('ended', () => { btn.textContent = '▶'; btn.classList.remove('playing'); if (_currentSessionAudioId === id) { _currentSessionAudio = null; _currentSessionAudioId = null; } });
    audio.addEventListener('error', () => { btn.textContent = '▶'; btn.classList.remove('playing'); if (_currentSessionAudioId === id) { _currentSessionAudio = null; _currentSessionAudioId = null; } });
    audio.play().catch(() => { btn.textContent = '▶'; btn.classList.remove('playing'); if (_currentSessionAudioId === id) { _currentSessionAudio = null; _currentSessionAudioId = null; } });
  } else if (action === 'download') {
    let audioSource = session.audioUrl || session.audioBase64 || null;
    if (!audioSource) {
      try { audioSource = await getPrivateSessionAudioUrl(session); }
      catch (err) { showToast(t('toast.error')); return; }
    }
    if (!audioSource) return;
    const legacyFormat = session.audioBase64?.startsWith('data:audio/mpeg') ? 'mp3' : session.audioBase64?.startsWith('data:audio/mp4') ? 'm4a' : 'webm';
    await downloadAudioSource(audioSource, session.audioFormat || legacyFormat, session.date);
  } else if (action === 'delete') {
    if (_currentSessionAudioId === id && _currentSessionAudio) {
      _currentSessionAudio.pause();
      _currentSessionAudio = null;
      _currentSessionAudioId = null;
    }
    const itemEl = document.querySelector(`.session-item[data-session-id="${id}"]`);
    await dissolveElement(itemEl);
    try { await deleteDoc(doc(db, 'users', currentUser.uid, 'sessions', id)); await audioStore.deleteAudio(id); lastSessionsCache = lastSessionsCache.filter(item => item.id !== id); renderRecent(lastSessionsCache); showToast(t('toast.sessionDeleted')); }
    catch (err) { showToast(t('toast.error')); }
  }
});

function dissolveElement(el) {
  return new Promise(resolve => {
    if (!el) { resolve(); return; }
    const rect = el.getBoundingClientRect();
    const bg = getComputedStyle(el).backgroundColor || '#4A7C59';
    const layer = document.createElement('div');
    layer.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:9999;overflow:hidden';
    document.body.appendChild(layer);
    const particles = 40;
    for (let i = 0; i < particles; i++) {
      const p = document.createElement('div');
      p.className = 'dissolve-particle';
      const px = rect.left + Math.random() * rect.width;
      const py = rect.top + Math.random() * rect.height;
      p.style.cssText = `position:fixed;left:${px}px;top:${py}px;width:3px;height:3px;background:${bg};border-radius:50%;opacity:1;`;
      const dx = (Math.random() - 0.5) * 220;
      const dy = (Math.random() - 0.5) * 220 + 80;
      const rot = (Math.random() - 0.5) * 360;
      const dur = 700 + Math.random() * 500;
      p.animate(
        [{ opacity: 1, transform: 'translate(0,0) scale(1) rotate(0)' },
         { opacity: 0.6, transform: `translate(${dx*0.6}px,${dy*0.6}px) scale(0.8) rotate(${rot*0.6}deg)`, offset: 0.5 },
         { opacity: 0, transform: `translate(${dx}px,${dy}px) scale(0.1) rotate(${rot}deg)` }],
        { duration: dur, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' }
      ).onfinish = () => p.remove();
      layer.appendChild(p);
    }
    el.style.transition = 'opacity .3s ease, transform .3s ease';
    el.style.opacity = '0';
    el.style.transform = 'scale(0.95)';
    setTimeout(() => { el.remove(); layer.remove(); resolve(); }, 900);
  });
}

const practiceTextEl = $('#practiceText');
let userEditedPractice = false;
let currentScenarioKey = null;
function updatePracticeCounter() { const len = practiceTextEl.textContent.length; const el = $('#practiceCount'); if (el) el.textContent = len; const live = $('#practiceHintLive'); if (live) live.textContent = `${len} / 2000`; }
function setPracticeText(force = false) {
  if (currentScenarioKey !== null) {
    const scenario = (SCENARIOS[currentLang] || SCENARIOS.en)?.[currentScenarioKey] || SCENARIOS.en?.[currentScenarioKey];
    if (scenario) practiceTextEl.textContent = scenario.text;
    updatePracticeCounter();
    userEditedPractice = true;
    return;
  }
  if (!force && userEditedPractice) return;
  practiceTextEl.textContent = PRACTICE_TEXT[currentLang] || PRACTICE_TEXT.en;
  updatePracticeCounter();
  userEditedPractice = false;
}
function customTextsStorageKey() {
  return `otklik_custom_texts_${currentUser?.uid || 'guest'}`;
}
function getCustomTexts() {
  try {
    const parsed = JSON.parse(localStorage.getItem(customTextsStorageKey()) || '[]');
    return Array.isArray(parsed) ? parsed.filter(item => item && typeof item.id === 'string' && typeof item.label === 'string' && typeof item.text === 'string') .slice(0, 3 + (Number(userData?.purchases?.extraTextsBought || 0))) : [];
  } catch (error) { return []; }
}
function renderScenarios() {
  const grid = $('#scenariosGrid');
  if (!grid) return;
  const scenarios = SCENARIOS[currentLang] || SCENARIOS.en;
  grid.innerHTML = '';
  Object.entries(scenarios).forEach(([key, scenario]) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'scenario-item';
    button.dataset.scenario = key;
    const icon = document.createElement('span');
    icon.className = 'scenario-icon';
    icon.textContent = scenario.icon;
    const title = document.createElement('span');
    title.className = 'scenario-title';
    title.textContent = scenario.title;
    const hint = document.createElement('span');
    hint.className = 'scenario-hint';
    hint.textContent = scenario.hint;
    button.append(icon, title, hint);
    grid.appendChild(button);
  });
}
function renderCustomTexts() {
  const list = $('#scenariosCustomList');
  if (!list) return;
  const items = getCustomTexts();
  const hint = $('#scenariosCustomHint');
  if (hint) hint.textContent = `${t('scenarios.customHint')} · ${t('scenarios.customHintCounter', {n:items.length, max:3})}`;
  list.innerHTML = '';
  items.forEach(item => {
    const row = document.createElement('div');
    row.className = 'custom-text-item';
    const label = document.createElement('span');
    label.className = 'custom-text-label';
    label.textContent = item.label;
    const use = document.createElement('button');
    use.type = 'button';
    use.dataset.use = item.id;
    use.textContent = t('scenarios.use');
    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'delete';
    del.dataset.delete = item.id;
    del.textContent = t('scenarios.delete');
    row.append(label, use, del);
    list.appendChild(row);
  });
  const addButton = $('#scenariosAddCustomBtn');
  if (addButton) {
    addButton.disabled = items.length >= 3;
    addButton.title = items.length >= 3 ? t('scenarios.limitReached') : '';
  }
}
$('#practiceScenariosBtn')?.addEventListener('click', () => {
  renderScenarios();
  renderCustomTexts();
  openModal('scenariosModal');
});
$('#scenariosGrid')?.addEventListener('click', event => {
  const button = event.target.closest('[data-scenario]');
  if (!button) return;
  const key = button.dataset.scenario;
  const scenario = (SCENARIOS[currentLang] || SCENARIOS.en)[key];
  if (!scenario) return;
  currentScenarioKey = key;
  practiceTextEl.textContent = scenario.text;
  updatePracticeCounter();
  userEditedPractice = true;
  closeModal('scenariosModal');
  showToast(`${t('scenarios.title')}: ${scenario.title}`);
});
$('#scenariosCustomList')?.addEventListener('click', event => {
  const useButton = event.target.closest('[data-use]');
  const deleteButton = event.target.closest('[data-delete]');
  if (useButton) {
    const item = getCustomTexts().find(entry => entry.id === useButton.dataset.use);
    if (!item) return;
    currentScenarioKey = null;
    practiceTextEl.textContent = item.text;
    updatePracticeCounter();
    userEditedPractice = true;
    closeModal('scenariosModal');
  } else if (deleteButton) {
    const remaining = getCustomTexts().filter(entry => entry.id !== deleteButton.dataset.delete);
    localStorage.setItem(customTextsStorageKey(), JSON.stringify(remaining));
    renderCustomTexts();
  }
});
$('#scenariosAddCustomBtn')?.addEventListener('click', () => {
  const items = getCustomTexts();
  if (items.length >= 3) { showToast(t('scenarios.limitReached')); return; }
  $('#customTextLabel').value = '';
  $('#customTextBody').value = '';
  openModal('addCustomTextModal');
  setTimeout(() => $('#customTextLabel')?.focus(), 80);
});
$('#customTextSaveBtn')?.addEventListener('click', () => {
  const label = $('#customTextLabel').value.trim();
  const text = $('#customTextBody').value.trim();
  if (!label || !text) { showToast(t('scenarios.emptyError')); return; }
  const items = getCustomTexts();
  if (items.length >= 3) { showToast(t('scenarios.limitReached')); closeModal('addCustomTextModal'); renderCustomTexts(); return; }
  const id = (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : `${Date.now()}_${Math.random().toString(36).slice(2,10)}`;
  items.push({ id, label: label.slice(0,40), text: text.slice(0,2000) });
  localStorage.setItem(customTextsStorageKey(), JSON.stringify(items));
  closeModal('addCustomTextModal');
  renderCustomTexts();
  showToast(t('scenarios.saved'));
});
renderScenarios();
renderCustomTexts();
practiceTextEl.addEventListener('focus', () => { if (practiceTextEl.textContent.length === 0 || userEditedPractice) return; requestAnimationFrame(() => { const range = document.createRange(); range.selectNodeContents(practiceTextEl); const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(range); }); });
const practiceCardEl = practiceTextEl.closest('.practice-card');
const practiceResizeHandle = $('#practiceResizeHandle');
const practiceResetSize = $('#practiceResetSize');
const PRACTICE_HEIGHT_KEY = 'otklik_practice_text_height';
function restorePracticeTextHeight() {
  const savedHeight = Number(localStorage.getItem(PRACTICE_HEIGHT_KEY));
  if (Number.isFinite(savedHeight) && savedHeight >= 100) {
    practiceTextEl.style.height = `${Math.min(720, savedHeight)}px`;
    practiceCardEl?.classList.add('practice-custom-size');
  }
}
restorePracticeTextHeight();
if (practiceResizeHandle) {
  let resizePointerId = null, resizeStartY = 0, resizeStartHeight = 0, resizeCurrentHeight = 0;
  practiceResizeHandle.addEventListener('pointerdown', (event) => {
    if (event.button !== undefined && event.button !== 0) return;
    resizePointerId = event.pointerId; resizeStartY = event.clientY;
    resizeStartHeight = practiceTextEl.getBoundingClientRect().height;
    resizeCurrentHeight = resizeStartHeight;
    practiceResizeHandle.setPointerCapture?.(event.pointerId);
    event.preventDefault();
  });
  practiceResizeHandle.addEventListener('pointermove', (event) => {
    if (resizePointerId !== event.pointerId) return;
    resizeCurrentHeight = Math.max(100, Math.min(720, resizeStartHeight + (event.clientY - resizeStartY)));
    practiceTextEl.style.height = `${resizeCurrentHeight}px`;
    practiceCardEl?.classList.toggle('practice-custom-size', Math.abs(resizeCurrentHeight - resizeStartHeight) > 1 || !!localStorage.getItem(PRACTICE_HEIGHT_KEY));
  });
  const finishPracticeResize = (event) => {
    if (resizePointerId !== event.pointerId) return;
    if (Math.abs(resizeCurrentHeight - resizeStartHeight) > 1) {
      localStorage.setItem(PRACTICE_HEIGHT_KEY, String(Math.round(resizeCurrentHeight)));
      practiceCardEl?.classList.add('practice-custom-size');
    }
    resizePointerId = null;
  };
  practiceResizeHandle.addEventListener('pointerup', finishPracticeResize);
  practiceResizeHandle.addEventListener('pointercancel', finishPracticeResize);
}
practiceResetSize?.addEventListener('click', () => {
  const from = practiceTextEl.getBoundingClientRect().height;
  practiceTextEl.style.height = 'auto';
  const to = practiceTextEl.getBoundingClientRect().height;
  practiceTextEl.style.height = `${from}px`;
  const animation = practiceTextEl.animate([{height:`${from}px`},{height:`${to}px`}], {duration:360,easing:'cubic-bezier(.2,.75,.25,1)'});
  animation.onfinish = () => {
    practiceTextEl.style.height = '';
    localStorage.removeItem(PRACTICE_HEIGHT_KEY);
    practiceCardEl?.classList.remove('practice-custom-size');
  };
});

practiceTextEl.addEventListener('input', () => {
  currentScenarioKey = null;
  userEditedPractice = true;
  const text = practiceTextEl.textContent;
  if (text.length > 2000) {
    practiceTextEl.textContent = text.slice(0, 2000);
    const range = document.createRange(); range.selectNodeContents(practiceTextEl); range.collapse(false);
    const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(range);
    showToast(t('toast.limitChars'));
  }
  updatePracticeCounter();
});

$('#settingsOpen')?.addEventListener('click', () => { $('#avatarPicker').classList.remove('open'); openModal('settingsModal'); });
$('#settingsAvatar')?.addEventListener('click', () => { $('#avatarPicker').classList.toggle('open'); });

function shatterEmoji(el) {
  const emoji = el.textContent.trim(); if (!emoji) return;
  const rect = el.getBoundingClientRect(), cx = rect.left + rect.width / 2, cy = rect.top + rect.height / 2, count = 16, baseSize = Math.min(rect.width, rect.height);
  for (let i = 0; i < count; i++) {
    const p = document.createElement('span'); p.textContent = emoji;
    p.style.cssText = `position:fixed;left:${cx}px;top:${cy}px;font-size:${baseSize * 0.38}px;pointer-events:none;z-index:9999;transform:translate(-50%,-50%);user-select:none;`;
    document.body.appendChild(p);
    const angle = (Math.PI * 2 * i / count) + (Math.random() - 0.5) * 0.6, dist = 40 + Math.random() * 55, dx = Math.cos(angle) * dist, dy = Math.sin(angle) * dist;
    p.animate([{ transform: 'translate(-50%,-50%) scale(1)', opacity: 1 }, { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px)) scale(0.15)`, opacity: 0 }], { duration: 600, easing: 'cubic-bezier(0.22, 0.61, 0.36, 1)' }).onfinish = () => p.remove();
  }
}

$('#settingsAvatarGrid')?.addEventListener('click', async (e) => {
  const btn = e.target.closest('.avatar-opt'); if (!btn || !currentUser) return;
  const newAvatar = btn.dataset.val, oldAvatar = userData.profile.avatar || '🦊';
  if (newAvatar === oldAvatar) { $('#avatarPicker').classList.remove('open'); return; }
  shatterEmoji($('#settingsAvatarText')); $('#settingsAvatarText').style.opacity = '0'; $('#avatarPicker').classList.remove('open');
  try {
    await updateDoc(doc(db, 'users', currentUser.uid), { 'profile.avatar': newAvatar });
    userData.profile.avatar = newAvatar;
    $$('#settingsAvatarGrid .avatar-opt').forEach(b => b.classList.toggle('selected', b.dataset.val === newAvatar));
    setTimeout(() => { $('#settingsAvatarText').textContent = newAvatar; $('#settingsAvatarText').style.opacity = '1'; $('#settingsAvatar').classList.remove('pop-in'); void $('#settingsAvatar').offsetWidth; $('#settingsAvatar').classList.add('pop-in'); $('#mainAvatarEmoji').textContent = newAvatar; showToast(t('toast.avatarUpdated')); }, 200);
  } catch (err) { $('#settingsAvatarText').textContent = oldAvatar; $('#settingsAvatarText').style.opacity = '1'; showToast(t('toast.error')); }
});

$('#settingsNickname')?.addEventListener('change', async () => {
  if (!currentUser || !userData) return;
  const newName = $('#settingsNickname').value.trim();
  if (!newName) { $('#settingsNickname').value = userData.profile.nickname; return; }
  if (newName === userData.profile.nickname || newName.length > 30) return;
  try { await updateDoc(doc(db, 'users', currentUser.uid), { 'profile.nickname': newName }); userData.profile.nickname = newName; showToast(t('toast.nameUpdated')); }
  catch (err) { showToast(t('toast.error')); $('#settingsNickname').value = userData.profile.nickname; }
});


$('#logoutBtn')?.addEventListener('click', () => { closeModal('settingsModal'); openModal('logoutConfirmModal'); });
$('#confirmLogoutBtn')?.addEventListener('click', () => { closeModal('logoutConfirmModal'); signOut(auth); });

$('#openFeedbackBtn')?.addEventListener('click', () => { closeModal('settingsModal'); openModal('feedbackModal'); });
$('#feedbackForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const type = currentFbType || 'bug';
  const text = $('#fbText').value.trim(); if (!text) return;
  if (text.length > 2000) { showToast(t('toast.limitChars')); return; }
  if (Date.now() - lastSendTime < 2000) { showToast(t('toast.tooFast')); return; }
  lastSendTime = Date.now();
  try {
    await addDoc(collection(db, 'feedback'), { uid: currentUser.uid, email: userData.email, type, text, createdAt: serverTimestamp() });
    $('#fbText').value = '';
    closeModal('feedbackModal');
    setTimeout(() => { openModal('feedbackThanksModal'); confetti({ particleCount: 150, spread: 90, origin: { y: 0.5 }, colors: ['#4A7C59', '#9C89B8', '#22C55E', '#8AB09A'] }); }, 250);
  } catch (e) { showToast(t('toast.error')); }
});

$('#openSupportBtn')?.addEventListener('click', () => {
  closeModal('settingsModal');
  if (currentUser) {
    supportChatOpen = true; supportFirstRender = true;
    lastSeenSupportTime = Date.now();
    supportMessages.forEach(m => { const ts = m.createdAt?.toMillis?.() || 0; if (ts > lastSeenSupportTime - 1000) lastSeenSupportTime = Math.max(lastSeenSupportTime, ts); });
    localStorage.setItem(`otklik_support_seen_${currentUser.uid}`, String(lastSeenSupportTime));
    updateUnreadIndicator(); updateSupportStatus(); renderSupportMessages();
  }
  openModal('supportModal');
});

$('#chatSendBtn')?.addEventListener('click', async () => {
  const text = $('#chatInput').value.trim();
  if (!text || !currentUser) return;
  if (text.length > 2000) { showToast(t('toast.limitChars')); return; }
  if (Date.now() - lastSendTime < 2000) { showToast(t('toast.tooFast')); return; }
  lastSendTime = Date.now();
  $('#chatInput').value = '';
  const msgData = { from: 'user', text, createdAt: serverTimestamp() };
  if (replyingTo) { msgData.replyTo = { text: replyingTo.text, from: replyingTo.from }; }
  replyingTo = null; $('#chatReplyPreview').style.display = 'none';
  try { await addDoc(collection(db, 'support', currentUser.uid, 'messages'), msgData); }
  catch (e) { showToast(t('toast.error')); }
});
$('#chatInput')?.addEventListener('keypress', (e) => { if (e.key === 'Enter') { e.preventDefault(); $('#chatSendBtn').click(); } });
let supportStatusTimer = null;
function syncSupportStatusTimer() {
  if (document.hidden) { clearInterval(supportStatusTimer); supportStatusTimer = null; return; }
  if (!supportStatusTimer) supportStatusTimer = setInterval(updateSupportStatus, 60000);
  updateSupportStatus();
}
syncSupportStatusTimer();

function openDeleteConfirm() {
  openModal('deleteAccountModal'); let remaining = 10; const btn = $('#confirmDeleteBtn'); btn.disabled = true; btn.textContent = t('deleteAccount.countdown', { n: remaining }); clearInterval(deleteTimer);
  deleteTimer = setInterval(() => { remaining--; if (remaining <= 0) { clearInterval(deleteTimer); deleteTimer = null; btn.disabled = false; btn.textContent = t('common.delete'); } else btn.textContent = t('deleteAccount.countdown', { n: remaining }); }, 1000);
}
function cancelDelete() { if (deleteTimer) { clearInterval(deleteTimer); deleteTimer = null; } closeModal('deleteAccountModal'); const btn = $('#confirmDeleteBtn'); btn.disabled = true; btn.textContent = t('deleteAccount.countdown', { n: 10 }); }
$('#deleteAccountBtn')?.addEventListener('click', () => { closeModal('settingsModal'); openDeleteConfirm(); });
$('#cancelDeleteBtn')?.addEventListener('click', cancelDelete);
$$('[data-close-delete]').forEach(b => b.addEventListener('click', cancelDelete));

$('#confirmDeleteBtn')?.addEventListener('click', async () => {
  const btn = $('#confirmDeleteBtn');
  if (btn.disabled || !currentUser) return;
  btn.disabled = true;
  btn.textContent = '...';
  try {
    const userToDelete = currentUser;
    const uid = userToDelete.uid;
    const username = userData?.profile?.username;
    await reauthenticateWithPopup(userToDelete, new GoogleAuthProvider());
    const sessionsSnap = await getDocs(collection(db, 'users', uid, 'sessions'));
    for (const sessionDoc of sessionsSnap.docs) {
      const sessionData = sessionDoc.data();
      if (sessionData.audioPath) {
        try { await deleteObject(storageRef(storage, sessionData.audioPath)); }
        catch (storageError) { if (storageError?.code !== 'storage/object-not-found') throw storageError; }
      }
      await deleteDoc(sessionDoc.ref);
    }
    for (const subcollection of ['diary', 'hrtLogs', 'programs']) {
      const snapshot = await getDocs(collection(db, 'users', uid, subcollection));
      for (const item of snapshot.docs) await deleteDoc(item.ref);
    }
    const supportSnap = await getDocs(collection(db, 'support', uid, 'messages'));
    for (const item of supportSnap.docs) await deleteDoc(item.ref);
    const feedbackSnap = await getDocs(query(collection(db, 'feedback'), where('uid', '==', uid)));
    for (const item of feedbackSnap.docs) await deleteDoc(item.ref);
    const postsSnap = await getDocs(query(collection(db, 'community_posts'), where('uid', '==', uid)));
    for (const item of postsSnap.docs) await deleteDoc(item.ref);
    await deleteDoc(doc(db, 'users', uid));
    if (username) await deleteDoc(doc(db, 'usernames', username));
    await deleteUser(userToDelete);
    safeSession.remove('otklik_unlocked');
    try { localStorage.removeItem('otklik_has_account'); } catch (storageError) {}
    cancelDelete();
    setTimeout(() => window.location.reload(), 800);
  } catch (e) {
    const code = e?.code || '';
    if (code === 'auth/requires-recent-login') {
      showToast(t('toast.reauthRequired'));
    } else {
      showToast(t('toast.error') + ': ' + (e?.message || 'Неизвестная ошибка'));
    }
    btn.disabled = false;
    btn.textContent = t('common.delete');
  }
});

$('#closerBtn')?.addEventListener('click', () => { openModal('closerModal'); });
$('#closerPageCta')?.addEventListener('click', () => { openModal('closerModal'); });
$('#closerCta')?.addEventListener('click', () => { showToast(t('toast.soon')); });

function updateHzScaleLabels() {
  const scale = $('#hzScale'); if (!scale) return;
  const span = scaleMax - scaleMin;
  const rough = span / 4;
  const magnitude = Math.pow(10, Math.floor(Math.log10(Math.max(1, rough))));
  const residual = rough / magnitude;
  const step = (residual <= 1 ? 1 : residual <= 2 ? 2 : residual <= 5 ? 5 : 10) * magnitude;
  const ticks = [];
  for (let hz = Math.ceil(scaleMin / step) * step; hz <= scaleMax + 0.001 && ticks.length < 12; hz += step) ticks.push(Math.round(hz));
  scale.innerHTML = '';
  ticks.forEach(hz => { const label = document.createElement('div'); label.className = 'hz-label'; label.dataset.hz = String(hz); label.textContent = String(hz); label.style.top = `${100 - ((hz - scaleMin) / span) * 100}%`; if (hz === ticks[0]) label.classList.add('edge-bottom'); if (hz === ticks[ticks.length - 1]) label.classList.add('edge-top'); scale.appendChild(label); });
  const reset = $('#graphScaleReset'); if (reset) reset.hidden = Math.abs(graphScaleSpan - 400) < 1 && Math.abs(graphScaleOffset) < 1;
}
function applyGraphScale(span, persist = false) {
  graphScaleSpan = Math.max(100, Math.min(1800, span));
  scaleMin = Math.max(0, 250 - graphScaleSpan / 2 + graphScaleOffset); graphScaleOffset = scaleMin - (250 - graphScaleSpan / 2); scaleMax = scaleMin + graphScaleSpan;
  updateHzScaleLabels(); drawGraph();
  if (persist) {
    localStorage.setItem('graphScaleSpan', String(Math.round(graphScaleSpan)));
    localStorage.setItem('graphScaleOffset', String(Math.round(graphScaleOffset)));
  }
}
const hzScale = $('#hzScale');
if (hzScale) {
  hzScale.addEventListener('pointerdown', e => { if (e.button !== 0 && e.pointerType === 'mouse') return; e.preventDefault(); graphScaleDrag = { y: e.clientY, span: graphScaleSpan, moved: false, pointerId: e.pointerId }; hzScale.classList.add('is-dragging'); hzScale.setPointerCapture?.(e.pointerId); });
  hzScale.addEventListener('pointermove', e => { if (!graphScaleDrag || graphScaleDrag.pointerId !== e.pointerId) return; const dy = e.clientY - graphScaleDrag.y; if (Math.abs(dy) > 2) graphScaleDrag.moved = true; applyGraphScale(graphScaleDrag.span * Math.exp(-dy * 0.008)); });
  const finishScale = e => { if (!graphScaleDrag || (e && graphScaleDrag.pointerId !== e.pointerId)) return; localStorage.setItem('graphScaleSpan', String(Math.round(graphScaleSpan))); localStorage.setItem('graphScaleOffset', String(Math.round(graphScaleOffset))); graphScaleDrag = null; hzScale.classList.remove('is-dragging'); };
  hzScale.addEventListener('pointerup', finishScale); hzScale.addEventListener('pointercancel', finishScale);
  hzScale.addEventListener('lostpointercapture', finishScale);
}
$('#graphScaleReset')?.addEventListener('click', () => {
  const startSpan = graphScaleSpan;
  const startOffset = graphScaleOffset;
  const startTime = performance.now();
  const duration = 240;
  const animateReset = now => {
    const progress = Math.min(1, (now - startTime) / duration);
    const eased = 1 - Math.pow(1 - progress, 3);
    graphScaleOffset = startOffset * (1 - eased);
    applyGraphScale(startSpan + (400 - startSpan) * eased);
    if (progress < 1) {
      requestAnimationFrame(animateReset);
    } else {
      graphScaleSpan = 400;
      graphScaleOffset = 0;
      applyGraphScale(400, true);
      localStorage.setItem('graphScaleOffset', '0');
    }
  };
  requestAnimationFrame(animateReset);
});
if (canvas) {
  canvas.addEventListener('pointerdown', event => {
    if (event.pointerType !== 'mouse' || event.button !== 0) return;
    const rect = canvas.getBoundingClientRect();
    if (!rect.height) return;
    event.preventDefault();
    graphPanDrag = { pointerId: event.pointerId, startY: event.clientY, startOffset: graphScaleOffset, height: rect.height, span: graphScaleSpan };
    canvas.classList.add('is-panning');
    canvas.setPointerCapture?.(event.pointerId);
  });
  canvas.addEventListener('pointermove', event => {
    if (!graphPanDrag || graphPanDrag.pointerId !== event.pointerId) return;
    const dy = event.clientY - graphPanDrag.startY;
    graphScaleOffset = graphPanDrag.startOffset + dy * graphPanDrag.span / graphPanDrag.height;
    scaleMin = Math.max(0, 250 - graphScaleSpan / 2 + graphScaleOffset);
    graphScaleOffset = scaleMin - (250 - graphScaleSpan / 2);
    scaleMax = scaleMin + graphScaleSpan;
    updateHzScaleLabels();
    drawGraph();
  });
  const finishPan = event => {
    if (!graphPanDrag || (event && graphPanDrag.pointerId !== event.pointerId)) return;
    localStorage.setItem('graphScaleOffset', String(Math.round(graphScaleOffset)));
    graphPanDrag = null;
    canvas.classList.remove('is-panning');
  };
  canvas.addEventListener('pointerup', finishPan);
  canvas.addEventListener('pointercancel', finishPan);
  canvas.addEventListener('lostpointercapture', finishPan);
}
window.addEventListener('load', () => { resizeCanvas(); drawGraph(); });
window.addEventListener('resize', () => requestAnimationFrame(() => { resizeCanvas(); drawGraph(); }), { passive: true });
window.addEventListener('orientationchange', () => setTimeout(() => { resizeCanvas(); drawGraph(); }, 180), { passive: true });
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && running && audioCtx) {
    audioCtx.resume().then(() => {
      resizeCanvas();
      drawGraph();
      if (!rafId) rafId = requestAnimationFrame(audioLoop);
    }).catch(error => console.warn('AudioContext resume after visibility change failed:', error));
  }
});
updateHzScaleLabels();

if ('ResizeObserver' in window) { const ro = new ResizeObserver(() => { resizeCanvas(); if (activeMode === 'masc') drawVoiceProgress(lastSessionsCache); }); ro.observe($('#graphWrap')); }
requestAnimationFrame(() => { resizeCanvas(); });

let currentFbType = 'bug';
let lastSendTime = 0;
function initCustomSelect(rootId, onSelect) {
  const root = document.getElementById(rootId);
  if (!root) return;
  const btn = root.querySelector('.custom-select-btn');
  const panel = root.querySelector('.custom-select-panel');
  const label = root.querySelector('.custom-select-label');
  btn.addEventListener('click', (e) => { e.stopPropagation(); root.classList.toggle('open'); });
  panel.querySelectorAll('button').forEach(b => {
    b.addEventListener('click', () => {
      label.textContent = b.textContent;
      panel.querySelectorAll('button').forEach(x => x.classList.toggle('active', x === b));
      root.classList.remove('open');
      if (onSelect) onSelect(b.dataset.value || b.dataset.lang, b);
    });
  });
  document.addEventListener('click', (e) => { if (!root.contains(e.target)) root.classList.remove('open'); });
}

function changeLanguage(newLang) {
  if (newLang === currentLang) return;
  const overlay = $('#langOverlay');
  const textEl = $('#langOverlayText');
  if (textEl) textEl.textContent = t('lang.update');
  overlay.classList.add('show');
  setTimeout(() => {
    applyLang(newLang);
    if (currentUser) {
      updateDoc(doc(db, 'users', currentUser.uid), { lang: newLang }).then(() => { if (userData) userData.lang = newLang; }).catch(()=>{});
    }
    setTimeout(() => overlay.classList.remove('show'), 250);
  }, 1750);
}

initCustomSelect('langCustomSelect', (lang) => changeLanguage(lang));
initCustomSelect('fbCustomSelect', (value) => { currentFbType = value; });

let adminUnsub = null;

$('#adminPanelBtn')?.addEventListener('click', () => {
  closeModal('settingsModal');
  openModal('adminModal');
  loadAdminChats();
  loadAdminFeedback();
  $('#adminNewDot')?.classList.remove('active');
});

$$('.admin-tab').forEach(t => {
  t.addEventListener('click', () => {
    $$('.admin-tab').forEach(x => x.classList.remove('active'));
    $$('.admin-tab-content').forEach(x => x.classList.remove('active'));
    t.classList.add('active');
    $('#' + t.dataset.tab).classList.add('active');
  });
});

function setupAdminIndicator() {
  if (!isAdmin || !currentUser || currentUser.email !== 'theboyslikeit.ru@gmail.com' || currentUser.emailVerified !== true) return;
  try {
    const q = query(collectionGroup(db, 'messages'), limit(500));
    if (adminUnsub) adminUnsub();
    const unsub = onSnapshot(q, (snap) => {
      let unanswered = 0;
      const chatsMap = {};
      snap.forEach(d => {
        const uid = d.ref.parent.parent.id;
        const data = d.data();
        if (!chatsMap[uid]) chatsMap[uid] = { lastFrom: null, lastTs: 0 };
        const ts = data.createdAt?.toMillis?.() || 0;
        if (ts > chatsMap[uid].lastTs) { chatsMap[uid].lastTs = ts; chatsMap[uid].lastFrom = data.from; }
      });
      Object.values(chatsMap).forEach(c => { if (c.lastFrom === 'user') unanswered++; });
      const dot = $('#adminNewDot');
      if (dot) dot.classList.toggle('active', unanswered > 0);
    }, (err) => {
      if (adminUnsub) { adminUnsub(); adminUnsub = null; }
      console.info('Admin indicator unavailable:', err?.code || err?.message || err);
    });
    adminUnsub = unsub;
  } catch(e) { console.warn(e); }
}

async function loadAdminChats() {
  const listEl = $('#adminChatList');
  listEl.innerHTML = '<div class="empty">...</div>';
  try {
    const snap = await getDocs(query(collectionGroup(db, 'messages'), limit(1000)));
    const chatsMap = {};
    snap.forEach(d => {
      const uid = d.ref.parent.parent.id;
      if (!chatsMap[uid]) chatsMap[uid] = [];
      chatsMap[uid].push({ id: d.id, ...d.data() });
    });
    if (Object.keys(chatsMap).length === 0) { listEl.innerHTML = `<div class="empty">${t('admin.noMessages')}</div>`; return; }
    const chats = [];
    const uids = Object.keys(chatsMap);
    for (let i = 0; i < uids.length; i += 10) {
      const batch = uids.slice(i, i + 10);
      const profiles = await Promise.all(batch.map(uid => getDoc(doc(db, 'users', uid))));
      profiles.forEach((profileSnap, index) => {
        const uid = batch[index];
        const profile = profileSnap.exists() ? profileSnap.data() : {};
        chatsMap[uid].sort((a,b) => (a.createdAt?.toMillis?.() || 0) - (b.createdAt?.toMillis?.() || 0));
        const lastMsg = chatsMap[uid][chatsMap[uid].length - 1];
        chats.push({ uid, name: profile.profile?.nickname || 'User', avatar: profile.profile?.avatar || '👤', lastMsg, lastFrom: lastMsg.from, lastTs: lastMsg.createdAt?.toMillis?.() || 0 });
      });
    }
    const unanswered = chats.filter(c => c.lastFrom === 'user').sort((a,b) => b.lastTs - a.lastTs);
    const answered = chats.filter(c => c.lastFrom !== 'user').sort((a,b) => b.lastTs - a.lastTs);
    let html = '';
    if (unanswered.length) {
      html += `<div class="admin-chat-divider"><span>${t('admin.unanswered')}</span></div>`;
      html += unanswered.map(c => renderAdminChatItem(c, true)).join('');
    }
    if (answered.length) {
      if (unanswered.length) html += `<div class="admin-chat-divider"><span>${t('admin.answered')}</span></div>`;
      html += answered.map(c => renderAdminChatItem(c, false)).join('');
    }
    listEl.innerHTML = html;
    listEl.querySelectorAll('.admin-chat-item[data-uid]').forEach(item => item.addEventListener('click', () => window.openAdminChat(item.dataset.uid, item.dataset.name)));
    const dot = $('#adminNewDot');
    if (dot) dot.classList.toggle('active', unanswered.length > 0);
  } catch (err) { listEl.innerHTML = `<div class="empty" style="color:var(--danger)">${err.message}</div>`; }
}

function renderAdminChatItem(c, unanswered) {
  const safeAvatar = /^[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F1E6}-\u{1F1FF}✦♡☆☺☻♻︎]+$/u.test(String(c.avatar || '')) ? c.avatar : '👤';
  return `<button type="button" class="admin-chat-item ${unanswered ? 'unanswered' : ''}" data-uid="${escapeHtml(c.uid)}" data-name="${escapeHtml(c.name)}">
    <span class="admin-chat-avatar">${safeAvatar}</span>
    <span class="admin-chat-info"><strong>${escapeHtml(c.name)}</strong>
    <span>${escapeHtml((c.lastMsg.text || '').slice(0, 40))}${(c.lastMsg.text || '').length > 40 ? '...' : ''}</span></span>
  </button>`;
}

window.backToChats = function() {
  $('#adminChatView').style.display = 'none';
  $('#adminChatList').style.display = 'block';
  if (adminUnsub) { adminUnsub(); adminUnsub = null; }
};

let adminChatMessagesCache = [];
window.openAdminChat = function(uid, name) {
  adminTargetUid = uid;
  adminReplyingTo = null;
  $('#adminReplyPreview').style.display = 'none';
  $('#adminChatList').style.display = 'none';
  const chatView = $('#adminChatView');
  chatView.style.display = 'block';
  chatView.classList.remove('animating');
  void chatView.offsetWidth;
  chatView.classList.add('animating');
  $('#adminChatName').textContent = name;
  const scrollBtn = $('#adminScrollDown');
  if (scrollBtn) scrollBtn.classList.remove('show');
  if (adminUnsub) adminUnsub();
  const q = query(collection(db, 'support', uid, 'messages'), orderBy('createdAt', 'asc'));
  adminUnsub = onSnapshot(q, (snap) => {
    adminChatMessagesCache = [];
    snap.forEach(d => adminChatMessagesCache.push({ id: d.id, ...d.data() }));
    renderAdminChatMessages();
  });
};

function renderAdminChatMessages() {
  const chat = $('#adminChatMessages');
  if (!chat) return;
  const wantedIds = new Set(adminChatMessagesCache.map(msg => String(msg.id)));
  const existingIds = new Set([...chat.querySelectorAll('.admin-msg-row[data-id]')].map(node => node.dataset.id));
  chat.querySelectorAll('.admin-msg-row[data-id]').forEach(node => { if (!wantedIds.has(node.dataset.id)) { existingIds.delete(node.dataset.id); node.remove(); } });
  adminChatMessagesCache.forEach(msg => {
    if (existingIds.has(String(msg.id))) return;
    const isOwner = msg.from === 'owner';
    const time = msg.createdAt?.toDate?.();
    const timeStr = time ? time.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}) : '';
    const row = document.createElement('div');
    row.className = 'admin-msg-row ' + (isOwner ? 'owner' : 'user');
    row.dataset.id = String(msg.id);
    const bubble = document.createElement('div');
    bubble.className = 'admin-msg-bubble ' + (isOwner ? 'owner' : 'user');
    const replyHtml = msg.replyTo ? `<div class="chat-reply-quote"><b>${escapeHtml(msg.replyTo.from === 'owner' ? 'Admin' : 'User')}</b> ${escapeHtml(msg.replyTo.text)}</div>` : '';
    const reactions = msg.reactions || {};
    bubble.innerHTML = `${replyHtml}<div class="chat-bubble-text">${escapeHtml(msg.text || '')}</div><div class="admin-msg-time">${timeStr}</div>`;
    const validReactions = Object.entries(reactions).filter(([emoji, arr]) => ['❤️','👍','😊','🙏','✨','🎉'].includes(emoji) && Array.isArray(arr) && arr.length);
    if (validReactions.length) {
      const reactionHost = document.createElement('div');
      reactionHost.className = 'chat-reactions';
      validReactions.forEach(([emoji, arr]) => {
        const button = document.createElement('button');
        button.className = 'chat-reaction';
        button.dataset.msgId = String(msg.id);
        button.dataset.emoji = emoji;
        button.textContent = `${emoji} ${arr.length}`;
        reactionHost.appendChild(button);
      });
      bubble.appendChild(reactionHost);
    }
    const actions = document.createElement('div');
    actions.className = 'admin-msg-actions';
    actions.innerHTML = `
      <button class="admin-msg-action-btn" data-admin-act="reply" data-msg-id="${msg.id}" title="Reply">↩</button>
      <button class="admin-msg-action-btn" data-admin-act="react" data-msg-id="${msg.id}" title="React">😊</button>
      ${isOwner ? `<button class="admin-msg-action-btn danger" data-admin-act="delete" data-msg-id="${msg.id}" title="Delete">🗑</button>` : ''}`;
    row.appendChild(bubble); row.appendChild(actions);
    chat.appendChild(row);
    existingIds.add(String(msg.id));
  });
  chat.scrollTop = chat.scrollHeight;
  const scrollBtn = $('#adminScrollDown');
  if (scrollBtn) scrollBtn.classList.remove('show');
}

const adminMsgsEl = $('#adminChatMessages');
if (adminMsgsEl) {
  adminMsgsEl.addEventListener('scroll', () => {
    const nearBottom = adminMsgsEl.scrollHeight - adminMsgsEl.scrollTop - adminMsgsEl.clientHeight < 100;
    const scrollBtn = $('#adminScrollDown');
    if (scrollBtn) scrollBtn.classList.toggle('show', !nearBottom);
  }, {passive:true});
}
const adminScrollBtn = $('#adminScrollDown');
if (adminScrollBtn) {
  adminScrollBtn.addEventListener('click', () => {
    const chat = $('#adminChatMessages');
    if (chat) chat.scrollTo({top: chat.scrollHeight, behavior: 'smooth'});
  });
}

$('#adminChatMessages')?.addEventListener('click', async (e) => {
  const reaction = e.target.closest('.chat-reaction');
  if (reaction && adminTargetUid) {
    const msgId = reaction.dataset.msgId, emoji = reaction.dataset.emoji;
    try {
      const msg = adminChatMessagesCache.find(m => m.id === msgId);
      if (!msg) return;
      const arr = (msg.reactions || {})[emoji] || [];
      const field = `reactions.${emoji}`;
      if (arr.includes(currentUser.uid)) await updateDoc(doc(db, 'support', adminTargetUid, 'messages', msgId), { [field]: arrayRemove(currentUser.uid) });
      else await updateDoc(doc(db, 'support', adminTargetUid, 'messages', msgId), { [field]: arrayUnion(currentUser.uid) });
    } catch (err) { showToast(t('toast.error')); }
    return;
  }
  const btn = e.target.closest('[data-admin-act]');
  if (!btn || !adminTargetUid) return;
  const msgId = btn.dataset.msgId;
  const msg = adminChatMessagesCache.find(m => m.id === msgId);
  if (!msg) return;
  if (btn.dataset.adminAct === 'reply') {
    adminReplyingTo = { id: msgId, text: (msg.text || '').slice(0, 80), from: msg.from };
    $('#adminReplyName').textContent = msg.from === 'owner' ? 'Admin' : 'User';
    $('#adminReplyText').textContent = adminReplyingTo.text;
    $('#adminReplyPreview').style.display = 'flex';
    $('#adminChatInput').focus();
  } else if (btn.dataset.adminAct === 'react') {
    showReactionPickerForAdmin(btn, msgId);
  } else if (btn.dataset.adminAct === 'delete') {
    if (msg.from !== 'owner') { showToast(t('toast.cantDeleteUserMsg')); return; }
    if (!confirm('Delete this message?')) return;
    try { await deleteDoc(doc(db, 'support', adminTargetUid, 'messages', msgId)); showToast(t('toast.deleted')); }
    catch (err) { showToast(t('toast.error')); }
  }
});

function showReactionPickerForAdmin(btn, msgId) {
  document.querySelectorAll('.reaction-picker').forEach(p => p.remove());
  const picker = document.createElement('div');
  picker.className = 'reaction-picker';
  picker.innerHTML = ['❤️','👍','😊','🙏','✨','🎉'].map(e => `<button data-emoji="${e}">${e}</button>`).join('');
  document.body.appendChild(picker);
  const rect = btn.getBoundingClientRect();
  picker.style.left = Math.max(8, Math.min(window.innerWidth - 230, rect.left - 60)) + 'px';
  picker.style.top = (rect.top - 50) + 'px';
  picker.querySelectorAll('button').forEach(b => b.addEventListener('click', async () => {
    const emoji = b.dataset.emoji;
    const msg = adminChatMessagesCache.find(m => m.id === msgId);
    if (msg) {
      const arr = (msg.reactions || {})[emoji] || [];
      const field = `reactions.${emoji}`;
      try {
        if (arr.includes(currentUser.uid)) await updateDoc(doc(db, 'support', adminTargetUid, 'messages', msgId), { [field]: arrayRemove(currentUser.uid) });
        else await updateDoc(doc(db, 'support', adminTargetUid, 'messages', msgId), { [field]: arrayUnion(currentUser.uid) });
      } catch(e) { showToast(t('toast.error')); }
    }
    picker.remove();
  }));
  setTimeout(() => {
    const close = (ev) => { if (!picker.contains(ev.target)) { picker.remove(); document.removeEventListener('click', close); } };
    document.addEventListener('click', close);
  }, 10);
}

$('#adminReplyCancel')?.addEventListener('click', () => { adminReplyingTo = null; $('#adminReplyPreview').style.display = 'none'; });

$('#adminChatSendBtn')?.addEventListener('click', async () => {
  const text = $('#adminChatInput').value.trim();
  if (!text || !adminTargetUid) return;
  $('#adminChatInput').value = '';
  const msgData = { from: 'owner', text, createdAt: serverTimestamp() };
  if (adminReplyingTo) { msgData.replyTo = { text: adminReplyingTo.text, from: adminReplyingTo.from }; }
  adminReplyingTo = null; $('#adminReplyPreview').style.display = 'none';
  try { await addDoc(collection(db, 'support', adminTargetUid, 'messages'), msgData); }
  catch (err) { showToast(t('toast.error') + ': ' + err.message); }
});
$('#adminChatInput')?.addEventListener('keypress', (e) => { if (e.key === 'Enter') $('#adminChatSendBtn').click(); });

async function loadAdminFeedback() {
  const listEl = $('#adminFeedbackList');
  listEl.innerHTML = '<div class="empty">...</div>';
  try {
    const q = query(collection(db, 'feedback'), orderBy('createdAt', 'desc'), limit(100));
    const snap = await getDocs(q);
    if (snap.empty) { listEl.innerHTML = `<div class="empty">—</div>`; return; }
    let html = '';
    snap.forEach(d => {
      const data = d.data();
      const date = data.createdAt?.toDate() ? data.createdAt.toDate().toLocaleString() : '...';
      html += `<div class="card" style="margin-bottom:10px;padding:12px"><div style="display:flex;justify-content:space-between;font-size:11px;color:var(--muted);margin-bottom:6px"><span><b>${escapeHtml(data.type)}</b></span><span>${date}</span></div><div style="font-size:13px;margin-bottom:8px">${escapeHtml(data.text)}</div><div style="font-size:11px;color:var(--muted)">UID: ${escapeHtml(data.uid)}</div></div>`;
    });
    listEl.innerHTML = html;
  } catch (err) { listEl.innerHTML = `<div class="empty" style="color:var(--danger)">${err.message}</div>`; }
}

$('#welcomeSupportCta')?.addEventListener('click', () => closeModal('welcomeSupportModal'));
$('#welcomeSupportHideBtn')?.addEventListener('click', () => {
  if (currentUser) localStorage.setItem(`otklik_welcome_hidden_${currentUser.uid}`, '1');
  closeModal('welcomeSupportModal');
});
$('#welcomeSupportModal')?.addEventListener('click', (e) => {
  if (e.target.id === 'welcomeSupportModal') closeModal('welcomeSupportModal');
});

applyTranslations();

document.addEventListener('visibilitychange', async () => {
  syncSupportStatusTimer();
  if (document.hidden) { if (unsubscribeSessions) { unsubscribeSessions(); unsubscribeSessions = null; } if (unsubscribeSupport) { unsubscribeSupport(); unsubscribeSupport = null; } if (unsubscribeUserProfile) { unsubscribeUserProfile(); unsubscribeUserProfile = null; } }
  else if (currentUser) { setupUserProfileListener(); setupRealtimeListeners(); setupSupportListener(); }
  if (!running || !session) return;
  if (document.hidden) {
    try { await audioCtx?.suspend(); } catch (_) {}
    stopReminderTimers();
  } else {
    try { await audioCtx?.resume(); } catch (_) {}
    session.lastTick = performance.now();
    startReminderTimers();
  }
});
if (navigator.mediaDevices) {
  const checkMicrophoneTracks = () => {
    if (running && stream && !stream.getAudioTracks().some(track => track.readyState === 'live')) {
      showToast(t('mic.disconnected'));
      stopMic(false);
    }
  };
  if (typeof navigator.mediaDevices.addEventListener === 'function') navigator.mediaDevices.addEventListener('devicechange', checkMicrophoneTracks);
  else setInterval(checkMicrophoneTracks, 2000);
}
window.addEventListener('beforeinstallprompt', event => {
  event.preventDefault();
  installPromptEvent = event;
  const settings = $('#settingsModal .settings-section:last-child');
  if (settings && !$('#installAppBtn')) {
    const button = document.createElement('button');
    button.id = 'installAppBtn'; button.className = 'btn btn-secondary'; button.type = 'button';
    button.textContent = 'Установить приложение'; button.style.width = '100%';
    button.addEventListener('click', async () => {
      if (!installPromptEvent) return;
      installPromptEvent.prompt();
      await installPromptEvent.userChoice.catch(() => null);
      installPromptEvent = null; button.remove();
    });
    settings.appendChild(button);
  }
});
window.addEventListener('online', () => showToast(t('connection.restored')));
window.addEventListener('offline', () => showToast(t('connection.offline')));
['chatInput','adminChatInput'].forEach(id => {
  const field = document.getElementById(id);
  if (field) { field.setAttribute('enterkeyhint','send'); field.setAttribute('autocapitalize','sentences'); field.addEventListener('focus', () => setTimeout(() => field.scrollIntoView({block:'center',behavior:'smooth'}), 300)); }
});
['onbUsername'].forEach(id => {
  const field = document.getElementById(id);
  if (field) { field.setAttribute('enterkeyhint','next'); field.setAttribute('autocapitalize','none'); field.setAttribute('autocorrect','off'); field.setAttribute('spellcheck','false'); }
});
['onbNickname'].forEach(id => document.getElementById(id)?.setAttribute('enterkeyhint','next'));
document.querySelectorAll('.chat-messages,.admin-chat-container').forEach(el => { el.style.overscrollBehavior = 'contain'; });

