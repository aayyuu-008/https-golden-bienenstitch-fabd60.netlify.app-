import { MaterialIcons } from '@expo/vector-icons';
import React, { useEffect, useRef, useState } from 'react';
import { Dimensions, Keyboard, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const { width: SCREEN_W } = Dimensions.get('window');

// ─── INTERFACES ─────────────────────────────────────────────
interface ScreenSession { id: string; date: string; category: string; duration: number; }
interface SleepLog { id: string; date: string; bedtime: string; wakeTime: string; duration: number; quality: number; notes: string; }
interface TaskItem { id: string; title: string; priority: 'high' | 'medium' | 'low'; date: string; completed: boolean; }
interface User { email: string; name: string; }
interface MockUser { email: string; password: string; name: string; }
type Screen = 'dashboard' | 'screen-time' | 'activity' | 'sleep' | 'tasks' | 'suggestions';

// ─── THEME ──────────────────────────────────────────────────
const C = {
  bg: '#0B0D17', surface: '#1A1D2E', sidebar: '#0F1119', border: '#252836',
  text: '#FFFFFF', sub: '#8B8FA3', accent: '#6366F1', accentLight: '#818CF8',
  gradEnd: '#8B5CF6', green: '#10B981', amber: '#FBBF24', pink: '#EC4899',
  red: '#EF4444', blue: '#3B82F6', gray: '#6B7280',
};
const CAT_COLORS: Record<string, string> = { Work: C.accent, Study: C.blue, Entertainment: C.pink, Social: C.amber, Fitness: C.green, Other: C.gray };
const PRODUCTIVE = new Set(['Work', 'Study', 'Fitness']);

// ─── HELPERS ────────────────────────────────────────────────
const today = () => new Date().toISOString().split('T')[0];
const fmtDate = () => new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
const fmtMins = (m: number) => { if (!m || isNaN(m)) return '0m'; const h = Math.floor(m / 60); return h > 0 ? `${h}h ${m % 60}m` : `${m}m`; };
const fmtTimer = (s: number) => `${String(Math.floor(s / 3600)).padStart(2, '0')}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
const toMins = (t: string) => { if (!t) return 0; const p = String(t).split(':').map(Number); return (p[0] || 0) * 60 + (p[1] || 0); };
const last7 = () => Array.from({ length: 7 }, (_, i) => { const d = new Date(); d.setDate(d.getDate() - (6 - i)); return d.toISOString().split('T')[0]; });
const weekStart = () => { const d = new Date(); const day = d.getDay(); const diff = d.getDate() - day + (day === 0 ? -6 : 1); return new Date(new Date().setDate(diff)).toISOString().split('T')[0]; };
const dayLabel = (dateStr: string) => new Date(dateStr + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short' });

// FIX 1: Safe alert function for Web without TS errors
const showMsg = (msg: string) => {
  try { (window as any).alert(msg); } catch(e) { console.log(msg); }
};

// ─── STYLES ─────────────────────────────────────────────────
const S = StyleSheet.create({
  bg: { flex: 1, backgroundColor: C.bg },
  card: { backgroundColor: C.surface, borderRadius: 16, padding: 20, borderWidth: 1, borderColor: C.border },
  input: { backgroundColor: '#12141F', borderRadius: 12, borderWidth: 1, borderColor: C.border, paddingHorizontal: 16, paddingVertical: 14, color: C.text, fontSize: 15 },
  btn: { paddingVertical: 14, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  btnGrad: { backgroundColor: C.accent },
  sectionTitle: { fontSize: 16, fontWeight: '600', color: C.text, marginBottom: 14 },
  overlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.6)' },
  pill: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: C.border, backgroundColor: 'transparent' },
  pillActive: { backgroundColor: C.accent, borderColor: C.accent },
});

// ─── REUSABLE COMPONENTS ────────────────────────────────────
const StatCard = ({ icon, label, value, sub, color }: { icon: any; label: string; value: string; sub?: string; color: string }) => (
  <View style={[S.card, { flex: 1, minWidth: 0 }]}>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 }}>
      <View style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: color + '20', alignItems: 'center', justifyContent: 'center' }}>
        <MaterialIcons name={icon} size={18} color={color} />
      </View>
      <Text style={{ fontSize: 12, color: C.sub, flex: 1 }}>{label}</Text>
    </View>
    <Text style={{ fontSize: 22, fontWeight: '700', color: C.text }}>{value}</Text>
    {sub ? <Text style={{ fontSize: 12, color: C.sub, marginTop: 4 }}>{sub}</Text> : null}
  </View>
);

const EmptyState = ({ icon, msg }: { icon: any; msg: string }) => (
  <View style={{ alignItems: 'center', paddingVertical: 40 }}>
    <MaterialIcons name={icon} size={48} color={C.border} />
    <Text style={{ color: C.sub, marginTop: 12, fontSize: 14 }}>{msg}</Text>
  </View>
);

const StarRating = ({ rating, onRate, readonly = false }: { rating: number; onRate?: (r: number) => void; readonly?: boolean }) => (
  <View style={{ flexDirection: 'row', gap: 4 }}>
    {[1, 2, 3, 4, 5].map(s => (
      <TouchableOpacity key={s} disabled={readonly} onPress={() => onRate?.(s)} activeOpacity={0.7}>
        <MaterialIcons name={s <= rating ? 'star' : 'star-border'} size={26} color={C.amber} />
      </TouchableOpacity>
    ))}
  </View>
);

const MiniBar = ({ data, maxVal }: { data: number[]; maxVal: number }) => {
  const mx = Math.max(maxVal, 1);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 6, height: 80 }}>
      {data.map((v, i) => (
        <View key={i} style={{ flex: 1, alignItems: 'center', gap: 4 }}>
          <View style={{ width: '100%', borderRadius: 4, backgroundColor: C.accent, height: Math.max(4, (v / mx) * 60), opacity: v > 0 ? 1 : 0.2 }} />
          <Text style={{ fontSize: 10, color: C.sub }}>{dayLabel(last7()[i]).charAt(0)}{dayLabel(last7()[i]).charAt(1)}</Text>
        </View>
      ))}
    </View>
  );
};

// ─── LOGIN SCREEN ───────────────────────────────────────────
const LoginScreen = ({ setUser, registeredUsers, setRegisteredUsers }: {
  setUser: (u: User) => void;
  registeredUsers: MockUser[];
  setRegisteredUsers: React.Dispatch<React.SetStateAction<MockUser[]>>;
}) => {
  const [mode, setMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');

  const handle = () => {
    const trimmedEmail = email.trim().toLowerCase();
    const trimmedPassword = password.trim();
    const trimmedName = name.trim();

    if (!trimmedEmail || !trimmedPassword) {
      showMsg('Please fill in all fields');
      return;
    }
    if (mode === 'signup' && !trimmedName) {
      showMsg('Please enter your name');
      return;
    }

    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    if (!emailRegex.test(trimmedEmail)) {
      showMsg('Invalid email. Example: user@example.com');
      return;
    }

    if (mode === 'signup') {
      if (trimmedName.length < 2 || trimmedName.length > 50) {
        showMsg('Name must be between 2 and 50 characters');
        return;
      }
      if (!/^[a-zA-Z\s'-]+$/.test(trimmedName)) {
        showMsg('Name can only contain letters, spaces, hyphens and apostrophes');
        return;
      }
    }

    if (trimmedPassword.length < 8) {
      showMsg('Password must be at least 8 characters');
      return;
    }
    if (!/[A-Za-z]/.test(trimmedPassword) || !/[0-9]/.test(trimmedPassword)) {
      showMsg('Password must contain at least one letter and one number');
      return;
    }

    if (mode === 'signup') {
      const exists = registeredUsers.find(u => u.email.toLowerCase() === trimmedEmail);
      if (exists) {
        showMsg('Account already exists. Please sign in instead.');
        return;
      }
      setRegisteredUsers(prev => [...prev, { email: trimmedEmail, password: trimmedPassword, name: trimmedName }]);
      setUser({ email: trimmedEmail, name: trimmedName });
      return;
    }

    const foundUser = registeredUsers.find(
      u => u.email.toLowerCase() === trimmedEmail && u.password === trimmedPassword
    );
    if (!foundUser) {
      showMsg('Login failed. No account found with these credentials. Please sign up first.');
      return;
    }
    setUser({ email: foundUser.email, name: foundUser.name });
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#0B0D17', justifyContent: 'center', alignItems: 'center', paddingHorizontal: 24 }}>
      <View style={{ position: 'absolute', top: -120, left: -80, width: 350, height: 350, borderRadius: 175, backgroundColor: C.accent, opacity: 0.08 }} />
      <View style={{ position: 'absolute', bottom: -80, right: -60, width: 280, height: 280, borderRadius: 140, backgroundColor: C.gradEnd, opacity: 0.06 }} />

      <View style={{ width: '100%', maxWidth: 400, backgroundColor: C.surface, borderRadius: 24, padding: 32, borderWidth: 1, borderColor: C.border }}>
        <Text style={{ fontSize: 24, fontWeight: '700', color: C.text, textAlign: 'center', marginBottom: 4 }}>Day Log Pro</Text>
        <Text style={{ fontSize: 13, color: C.sub, textAlign: 'center', marginBottom: 28 }}>Track your day. Master your time.</Text>

        <View style={{ flexDirection: 'row', backgroundColor: '#12141F', borderRadius: 12, padding: 4, marginBottom: 28 }}>
          {(['signin', 'signup'] as const).map(m => (
            <TouchableOpacity
              key={m}
              style={{ flex: 1, paddingVertical: 10, borderRadius: 10, backgroundColor: mode === m ? C.accent : 'transparent', alignItems: 'center' }}
              onPress={() => setMode(m)}
            >
              <Text style={{ fontSize: 14, fontWeight: '600', color: mode === m ? '#FFF' : C.sub }}>
                {m === 'signin' ? 'Sign in' : 'Create account'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {mode === 'signup' && (
          <View style={{ marginBottom: 16 }}>
            <Text style={{ fontSize: 12, color: C.sub, marginBottom: 6 }}>Name</Text>
            <TextInput
              style={S.input}
              value={name}
              onChangeText={setName}
              placeholder="Your name"
              placeholderTextColor={C.gray}
            />
          </View>
        )}

        <View style={{ marginBottom: 16 }}>
          <Text style={{ fontSize: 12, color: C.sub, marginBottom: 6 }}>Email</Text>
          <TextInput
            style={S.input}
            value={email}
            onChangeText={setEmail}
            placeholder="you@example.com"
            placeholderTextColor={C.gray}
            keyboardType="email-address"
            autoCapitalize="none"
          />
        </View>

        <View style={{ marginBottom: 24 }}>
          <Text style={{ fontSize: 12, color: C.sub, marginBottom: 6 }}>Password</Text>
          <TextInput
            style={S.input}
            value={password}
            onChangeText={setPassword}
            placeholder="At least 8 characters"
            placeholderTextColor={C.gray}
            secureTextEntry
            autoCapitalize="none"
          />
          {mode === 'signup' && (
            <Text style={{ fontSize: 11, color: C.sub, marginTop: 6 }}>
              Must include letters and numbers.
            </Text>
          )}
        </View>

        <TouchableOpacity
          style={[S.btn, S.btnGrad]}
          onPress={handle}
          activeOpacity={0.85}
        >
          <Text style={{ color: '#FFF', fontSize: 15, fontWeight: '600' }}>
            {mode === 'signin' ? 'Sign in' : 'Create account'}
          </Text>
        </TouchableOpacity>

        <Text style={{ fontSize: 12, color: C.sub, textAlign: 'center', marginTop: 18 }}>
          {mode === 'signin' ? "Don't have an account? " : 'Already have an account? '}
          <Text
            style={{ color: C.accentLight, fontWeight: '600' }}
            onPress={() => setMode(mode === 'signin' ? 'signup' : 'signin')}
          >
            {mode === 'signin' ? 'Create one' : 'Sign in'}
          </Text>
        </Text>
      </View>
    </View>
  );
};

// ─── SIDEBAR ────────────────────────────────────────────────
const NAV_ITEMS: { key: Screen; icon: any; label: string }[] = [
  { key: 'dashboard', icon: 'dashboard', label: 'Dashboard' },
  { key: 'screen-time', icon: 'timer', label: 'Screen Time' },
  { key: 'activity', icon: 'bar-chart', label: 'Activity' },
  { key: 'sleep', icon: 'bedtime', label: 'Sleep' },
  { key: 'tasks', icon: 'check-circle', label: 'Tasks' },
  { key: 'suggestions', icon: 'lightbulb', label: 'Suggestions' },
];

const Sidebar = ({ open, onClose, active, onNav, user, onLogout }: {
  open: boolean; onClose: () => void; active: Screen; onNav: (s: Screen) => void; user: User; onLogout: () => void;
}) => {
  const insets = useSafeAreaInsets();
  if (!open) return null;
  return (
    <>
      <TouchableOpacity style={S.overlay} activeOpacity={1} onPress={onClose} />
      <View style={{ position: 'absolute', top: 0, left: 0, bottom: 0, width: 280, backgroundColor: C.sidebar, borderRightWidth: 1, borderColor: C.border, paddingTop: insets.top + 20, paddingBottom: insets.bottom + 20, zIndex: 10 }}>
        <Text style={{ fontSize: 20, fontWeight: '700', color: C.text, paddingHorizontal: 20, marginBottom: 32 }}>Day Log Pro</Text>
        <ScrollView>
          {NAV_ITEMS.map(item => (
            <TouchableOpacity key={item.key} style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 20, paddingVertical: 13, borderLeftWidth: 3, borderLeftColor: active === item.key ? C.accent : 'transparent', backgroundColor: active === item.key ? C.accent + '10' : 'transparent' }} onPress={() => { onNav(item.key); onClose(); }}>
              <MaterialIcons name={item.icon as any} size={22} color={active === item.key ? C.accentLight : C.sub} />
              <Text style={{ fontSize: 15, color: active === item.key ? C.text : C.sub, fontWeight: active === item.key ? '600' : '400' }}>{item.label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
        <View style={{ position: 'absolute', bottom: insets.bottom + 20, left: 0, right: 0, paddingHorizontal: 20 }}>
          <View style={{ height: 1, backgroundColor: C.border, marginBottom: 16 }} />
          <Text style={{ fontSize: 13, color: C.sub, marginBottom: 4 }}>{user.email}</Text>
          <TouchableOpacity style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 }} onPress={onLogout}>
            <MaterialIcons name="logout" size={18} color={C.red} />
            <Text style={{ fontSize: 14, color: C.red }}>Sign out</Text>
          </TouchableOpacity>
        </View>
      </View>
    </>
  );
};

// ─── HEADER ─────────────────────────────────────────────────
const Header = ({ title, onMenu }: { title: string; onMenu: () => void }) => (
  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 12, paddingBottom: 8 }}>
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <TouchableOpacity onPress={onMenu} hitSlop={8}><MaterialIcons name="menu" size={24} color={C.text} /></TouchableOpacity>
      <Text style={{ fontSize: 18, fontWeight: '700', color: C.text }}>{title}</Text>
    </View>
    <Text style={{ fontSize: 13, color: C.sub }}>{fmtDate()}</Text>
  </View>
);

// ─── DASHBOARD ──────────────────────────────────────────────
const DashboardScreen = ({ sessions, sleepLogs, tasks, userName }: { sessions: ScreenSession[]; sleepLogs: SleepLog[]; tasks: TaskItem[]; userName: string }) => {
  const t = today();
  const todaySessions = sessions.filter(s => s.date === t);
  const todayProdMins = todaySessions.filter(s => PRODUCTIVE.has(s.category)).reduce((a, s) => a + s.duration, 0);
  const todayTotalMins = todaySessions.reduce((a, s) => a + s.duration, 0);
  const prodPct = todayTotalMins > 0 ? Math.round((todayProdMins / todayTotalMins) * 100) : 0;
  const screenMins = todayTotalMins;
  const lastSleep = sleepLogs.length > 0 ? sleepLogs[sleepLogs.length - 1] : null;
  const openTasks = tasks.filter(t => !t.completed).length;

  const weekSessions = sessions.filter(s => s.date >= weekStart());
  const weekData = last7().map(d => weekSessions.filter(s => s.date === d).reduce((a, s) => a + s.duration, 0));
  const weekMax = Math.max(...weekData, 1);

  const catMins: Record<string, number> = {};
  todaySessions.forEach(s => { catMins[s.category] = (catMins[s.category] || 0) + s.duration; });
  const mixTotal = todayTotalMins || 1;

  const upcomingTasks = tasks.filter(t => !t.completed).slice(0, 3);

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 20, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
      <Text style={{ fontSize: 26, fontWeight: '700', color: C.text, marginBottom: 4 }}>Hi, {userName} 👋</Text>
      <Text style={{ fontSize: 14, color: C.sub, marginBottom: 24 }}>Here's your day at a glance.</Text>

      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 28 }}>
        <View style={{ flex: 1, minWidth: (SCREEN_W - 52) / 2 }}><StatCard icon="trending-up" label="Productivity" value={`${prodPct}%`} sub={prodPct > 0 ? 'On focused today' : '0m focused today'} color={C.accent} /></View>
        <View style={{ flex: 1, minWidth: (SCREEN_W - 52) / 2 }}><StatCard icon="phone-iphone" label="Screen Time" value={fmtMins(screenMins)} sub="Entertainment + social" color={C.pink} /></View>
        <View style={{ flex: 1, minWidth: (SCREEN_W - 52) / 2 }}><StatCard icon="bedtime" label="Last Sleep" value={lastSleep ? fmtMins(lastSleep.duration) : '—'} sub={lastSleep ? `${lastSleep.bedtime} → ${lastSleep.wakeTime}` : 'Not recorded'} color={C.gradEnd} /></View>
        <View style={{ flex: 1, minWidth: (SCREEN_W - 52) / 2 }}><StatCard icon="assignment" label="Open Tasks" value={`${openTasks}`} sub={openTasks === 0 ? 'All clear ✨' : `${openTasks} remaining`} color={C.green} /></View>
      </View>

      <Text style={S.sectionTitle}>Last 7 days</Text>
      <View style={[S.card, { marginBottom: 24 }]}>
        {weekData.every(v => v === 0) ? <EmptyState icon="bar-chart" msg="No data this week" /> : <MiniBar data={weekData} maxVal={weekMax} />}
      </View>

      <Text style={S.sectionTitle}>Today's mix</Text>
      <View style={[S.card, { marginBottom: 24 }]}>
        {todayTotalMins === 0 ? (
          <EmptyState icon="pie-chart" msg="No activity tracked today" />
        ) : (
          <View style={{ flexDirection: 'row', height: 28, borderRadius: 14, overflow: 'hidden', backgroundColor: '#12141F' }}>
            {Object.entries(catMins).map(([cat, mins]) => (
              <View key={cat} style={{ flex: mins / mixTotal, backgroundColor: CAT_COLORS[cat] || C.gray }} />
            ))}
          </View>
        )}
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 14 }}>
          {Object.entries(catMins).map(([cat, mins]) => (
            <View key={cat} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <View style={{ width: 10, height: 10, borderRadius: 3, backgroundColor: CAT_COLORS[cat] || C.gray }} />
              <Text style={{ fontSize: 12, color: C.sub }}>{cat} {fmtMins(mins)}</Text>
            </View>
          ))}
        </View>
      </View>

      <Text style={S.sectionTitle}>Upcoming tasks</Text>
      <View style={[S.card, { marginBottom: 24 }]}>
        {upcomingTasks.length === 0 ? (
          <View style={{ alignItems: 'center', paddingVertical: 10 }}><Text style={{ color: C.sub, fontSize: 14 }}>Nice work! 🎉</Text></View>
        ) : upcomingTasks.map(task => (
          <View key={task.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 }}>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: task.priority === 'high' ? C.red : task.priority === 'medium' ? C.amber : C.green }} />
            <Text style={{ fontSize: 14, color: C.text, flex: 1 }}>{task.title}</Text>
            <Text style={{ fontSize: 11, color: C.sub }}>{task.date}</Text>
          </View>
        ))}
      </View>
    </ScrollView>
  );
};

// ─── SCREEN TIME ────────────────────────────────────────────
const ScreenTimeScreen = ({ sessions, setSessions }: { sessions: ScreenSession[]; setSessions: React.Dispatch<React.SetStateAction<ScreenSession[]>> }) => {
  const [timerSec, setTimerSec] = useState(0);
  const [running, setRunning] = useState(false);
  const [timerCat, setTimerCat] = useState('Entertainment');
  const [logCat, setLogCat] = useState('Entertainment');
  const [logMins, setLogMins] = useState('30');
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (running) { intervalRef.current = setInterval(() => setTimerSec(p => p + 1), 1000); }
    else { if (intervalRef.current) clearInterval(intervalRef.current); }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [running]);

  const stopTimer = () => {
    setRunning(false);
    if (timerSec > 10) {
      const mins = Math.round(timerSec / 60) || 1;
      setSessions(prev => [...prev, { id: Date.now().toString(), date: today(), category: timerCat, duration: mins }]);
      showMsg(`Session saved: ${fmtMins(mins)} of ${timerCat} logged.`);
    }
    setTimerSec(0);
  };

  const addQuick = () => {
    const m = parseInt(logMins);
    if (!m || m <= 0) { showMsg('Error: Enter valid minutes'); return; }
    setSessions(prev => [...prev, { id: Date.now().toString(), date: today(), category: logCat, duration: m }]);
    setLogMins('30');
    Keyboard.dismiss();
  };

  const weekSessions = sessions.filter(s => s.date >= weekStart());
  const weekData = last7().map(d => weekSessions.filter(s => s.date === d).reduce((a, s) => a + s.duration, 0));
  const recentSessions = [...sessions].reverse().slice(0, 10);

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 20, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
      <View style={[S.card, { alignItems: 'center', marginBottom: 20 }]}>
        <Text style={{ fontSize: 14, color: C.sub, marginBottom: 16 }}>Live timer</Text>
        <Text style={{ fontSize: 48, fontWeight: '700', color: C.text, fontFamily: 'monospace', letterSpacing: 2 }}>{fmtTimer(timerSec)}</Text>
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 8, marginBottom: 20 }}>
          {['Work', 'Study', 'Entertainment', 'Social', 'Fitness'].map(c => (
            <TouchableOpacity key={c} style={[S.pill, timerCat === c && S.pillActive, { paddingHorizontal: 10, paddingVertical: 5 }]} onPress={() => { if (!running) setTimerCat(c); }}>
              <Text style={{ fontSize: 11, color: timerCat === c ? '#FFF' : C.sub }}>{c}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <Text style={{ fontSize: 13, color: C.sub, marginBottom: 16 }}>Category: {timerCat}</Text>
        {!running ? (
          <TouchableOpacity style={[S.btn, S.btnGrad, { width: 140 }]} onPress={() => setRunning(true)}>
            <MaterialIcons name="play-arrow" size={20} color="#FFF" /><Text style={{ color: '#FFF', fontWeight: '600', marginLeft: 6 }}>Start</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={[S.btn, { backgroundColor: C.red, width: 140 }]} onPress={stopTimer}>
            <MaterialIcons name="stop" size={20} color="#FFF" /><Text style={{ color: '#FFF', fontWeight: '600', marginLeft: 6 }}>Stop</Text>
          </TouchableOpacity>
        )}
      </View>

      <Text style={S.sectionTitle}>Quick log</Text>
      <View style={[S.card, { marginBottom: 24 }]}>
        <Text style={{ fontSize: 12, color: C.sub, marginBottom: 8 }}>Category</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 14 }}>
          {Object.keys(CAT_COLORS).map(c => (
            <TouchableOpacity key={c} style={[S.pill, { marginRight: 8 }, logCat === c && S.pillActive]} onPress={() => setLogCat(c)}>
              <Text style={{ fontSize: 13, color: logCat === c ? '#FFF' : C.sub }}>{c}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
        <Text style={{ fontSize: 12, color: C.sub, marginBottom: 8 }}>Minutes</Text>
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <TextInput style={[S.input, { flex: 1 }]} value={logMins} onChangeText={v => setLogMins(v.replace(/[^0-9]/g, ''))} keyboardType="number-pad" placeholder="30" placeholderTextColor={C.gray} />
          <TouchableOpacity style={[S.btn, S.btnGrad, { width: 70 }]} onPress={addQuick}><Text style={{ color: '#FFF', fontWeight: '600' }}>Add</Text></TouchableOpacity>
        </View>
      </View>

      <Text style={S.sectionTitle}>Total screen time – last 7 days</Text>
      <View style={[S.card, { marginBottom: 24 }]}>
        <Text style={{ fontSize: 22, fontWeight: '700', color: C.text, marginBottom: 16 }}>{fmtMins(weekSessions.reduce((a, s) => a + s.duration, 0))}</Text>
        <MiniBar data={weekData} maxVal={Math.max(...weekData, 1)} />
      </View>

      <Text style={S.sectionTitle}>Recent sessions</Text>
      <View style={[S.card]}>
        {recentSessions.length === 0 ? <EmptyState icon="history" msg="No sessions yet" /> : recentSessions.map(s => (
          <View key={s.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.border }}>
            <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: (CAT_COLORS[s.category] || C.gray) + '20', alignItems: 'center', justifyContent: 'center' }}>
              <MaterialIcons name={s.category === 'Work' ? 'work' : s.category === 'Study' ? 'school' : s.category === 'Entertainment' ? 'movie' : s.category === 'Social' ? 'people' : s.category === 'Fitness' ? 'fitness-center' : 'more-horiz'} size={18} color={CAT_COLORS[s.category] || C.gray} />
            </View>
            <View style={{ flex: 1 }}><Text style={{ fontSize: 14, color: C.text, fontWeight: '500' }}>{s.category}</Text><Text style={{ fontSize: 12, color: C.sub }}>{s.date}</Text></View>
            <Text style={{ fontSize: 14, fontWeight: '600', color: C.text }}>{fmtMins(s.duration)}</Text>
          </View>
        ))}
      </View>
    </ScrollView>
  );
};

// ─── ACTIVITY ───────────────────────────────────────────────
const ActivityScreen = ({ sessions }: { sessions: ScreenSession[] }) => {
  const weekSessions = sessions.filter(s => s.date >= weekStart());
  const totalMins = weekSessions.reduce((a, s) => a + s.duration, 0);
  const prodMins = weekSessions.filter(s => PRODUCTIVE.has(s.category)).reduce((a, s) => a + s.duration, 0);
  const score = totalMins > 0 ? Math.round((prodMins / totalMins) * 100) : 0;

  const catTotals: Record<string, number> = {};
  weekSessions.forEach(s => { catTotals[s.category] = (catTotals[s.category] || 0) + s.duration; });
  const topCat = Object.entries(catTotals).sort((a, b) => b[1] - a[1])[0];

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
      <View style={[S.card, { alignItems: 'center', marginBottom: 20 }]}>
        <Text style={{ fontSize: 14, color: C.sub, marginBottom: 12 }}>Productivity Score</Text>
        <Text style={{ fontSize: 14, color: C.sub, marginBottom: 4 }}>Last 7 days</Text>
        <View style={{ width: 120, height: 120, borderRadius: 60, borderWidth: 8, borderColor: score > 60 ? C.green : score > 30 ? C.amber : C.red, backgroundColor: (score > 60 ? C.green : score > 30 ? C.amber : C.red) + '15', justifyContent: 'center', alignItems: 'center', marginBottom: 8 }}>
          <Text style={{ fontSize: 36, fontWeight: '700', color: score > 60 ? C.green : score > 30 ? C.amber : C.red }}>{score}%</Text>
        </View>
      </View>

      <View style={{ flexDirection: 'row', gap: 12, marginBottom: 24 }}>
        <View style={{ flex: 1 }}><StatCard icon="schedule" label="Total Tracked" value={fmtMins(totalMins)} sub="This week" color={C.blue} /></View>
        <View style={{ flex: 1 }}><StatCard icon="trending-up" label="Productive Time" value={fmtMins(prodMins)} sub="Work + study + fitness" color={C.green} /></View>
      </View>

      <View style={[S.card, { marginBottom: 24 }]}>
        <Text style={{ fontSize: 13, color: C.sub, marginBottom: 4 }}>Top Category</Text>
        <Text style={{ fontSize: 20, fontWeight: '700', color: C.text }}>{topCat ? topCat[0] : '—'} {topCat ? `(${fmtMins(topCat[1])})` : ''}</Text>
      </View>

      <Text style={S.sectionTitle}>Hours per category – this week</Text>
      <View style={[S.card, { marginBottom: 24 }]}>
        {Object.keys(CAT_COLORS).map(cat => {
          const mins = catTotals[cat] || 0;
          const pct = totalMins > 0 ? Math.round((mins / totalMins) * 100) : 0;
          return (
            <View key={cat} style={{ marginBottom: 16 }}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
                <Text style={{ fontSize: 13, color: C.text }}>{cat}</Text>
                <Text style={{ fontSize: 12, color: C.sub }}>{fmtMins(mins)} – {pct}%</Text>
              </View>
              <View style={{ height: 8, borderRadius: 4, backgroundColor: '#12141F' }}>
                <View style={{ height: '100%', borderRadius: 4, backgroundColor: CAT_COLORS[cat], width: `${Math.max(pct, 2)}%` }} />
              </View>
            </View>
          );
        })}
      </View>

      <Text style={S.sectionTitle}>Breakdown</Text>
      <View style={[S.card]}>
        {Object.keys(CAT_COLORS).map(cat => {
          const mins = catTotals[cat] || 0;
          const pct = totalMins > 0 ? Math.round((mins / totalMins) * 100) : 0;
          return (
            <View key={cat} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.border }}>
              <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: CAT_COLORS[cat] }} />
              <Text style={{ flex: 1, fontSize: 14, color: C.text }}>{cat}</Text>
              <Text style={{ fontSize: 13, color: C.sub }}>{fmtMins(mins)} – {pct}%</Text>
            </View>
          );
        })}
      </View>
    </ScrollView>
  );
};

// ─── SLEEP ──────────────────────────────────────────────────
const SleepScreen = ({ logs, setLogs }: { logs: SleepLog[]; setLogs: React.Dispatch<React.SetStateAction<SleepLog[]>> }) => {
  const [bedtime, setBedtime] = useState('23:00');
  const [wakeTime, setWakeTime] = useState('07:00');
  const [quality, setQuality] = useState(0);
  const [notes, setNotes] = useState('');

  const weekLogs = logs.filter(l => l.date >= weekStart());
  const avgSleep = weekLogs.length > 0 ? weekLogs.reduce((a, l) => a + l.duration, 0) / weekLogs.length : 0;
  const avgQuality = weekLogs.length > 0 ? weekLogs.reduce((a, l) => a + l.quality, 0) / weekLogs.length : 0;

  const saveSleep = () => {
    if (quality === 0) { showMsg('Error: Please rate your sleep quality'); return; }
    let dur = toMins(wakeTime) - toMins(bedtime);
    if (dur <= 0) dur += 1440;
    if (dur < 15) { showMsg('Error: Duration too short'); return; }
    setLogs(prev => [...prev, { id: Date.now().toString(), date: today(), bedtime, wakeTime, duration: dur, quality, notes }]);
    setQuality(0); setNotes('');
    showMsg('Saved: Sleep log saved successfully.');
  };

  const weekData = last7().map(d => { const dayLogs = logs.filter(l => l.date === d); return dayLogs.length > 0 ? dayLogs.reduce((a, l) => a + l.duration, 0) / dayLogs.length : 0; });

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 20, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
      <Text style={{ fontSize: 14, color: C.sub, marginBottom: 20 }}>Track your sleep data and quality.</Text>

      <View style={{ flexDirection: 'row', gap: 12, marginBottom: 24 }}>
        <View style={{ flex: 1 }}><StatCard icon="bedtime" label="Avg Sleep (7d)" value={`${(avgSleep / 60).toFixed(1)}h`} sub="Target 7 – 9h" color={C.gradEnd} /></View>
        <View style={{ flex: 1 }}><StatCard icon="star" label="Avg Quality" value={`${avgQuality.toFixed(1)}/5`} sub="Last 7 days" color={C.amber} /></View>
        <View style={{ flex: 1 }}><StatCard icon="inventory" label="Total Logs" value={`${logs.length}`} color={C.blue} /></View>
      </View>

      <Text style={S.sectionTitle}>Log sleep</Text>
      <View style={[S.card, { marginBottom: 24 }]}>
        <Text style={{ fontSize: 12, color: C.sub, marginBottom: 6 }}>Date</Text>
        <Text style={{ fontSize: 15, color: C.text, marginBottom: 16 }}>{fmtDate()}</Text>

        <View style={{ flexDirection: 'row', gap: 12, marginBottom: 16 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 12, color: C.sub, marginBottom: 6 }}>Bedtime</Text>
            <TextInput style={S.input} value={bedtime} onChangeText={setBedtime} placeholder="23:00" placeholderTextColor={C.gray} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 12, color: C.sub, marginBottom: 6 }}>Wake time</Text>
            <TextInput style={S.input} value={wakeTime} onChangeText={setWakeTime} placeholder="07:00" placeholderTextColor={C.gray} />
          </View>
        </View>

        <Text style={{ fontSize: 12, color: C.sub, marginBottom: 4 }}>Sleep duration</Text>
        <Text style={{ fontSize: 16, fontWeight: '600', color: C.text, marginBottom: 16 }}>
          {(() => { let d = toMins(wakeTime) - toMins(bedtime); if (d <= 0) d += 1440; return fmtMins(d); })()}
        </Text>

        <Text style={{ fontSize: 12, color: C.sub, marginBottom: 8 }}>Sleep quality</Text>
        <StarRating rating={quality} onRate={setQuality} />
        <Text style={{ fontSize: 12, color: C.sub, marginTop: 4, marginBottom: 16 }}>{quality === 0 ? 'Tap to rate' : `${quality}/5`}</Text>

        <Text style={{ fontSize: 12, color: C.sub, marginBottom: 6 }}>Notes (optional)</Text>
        {/* FIX 3: Added 'as any' to fix TS error */}
        <TextInput style={[S.input, { height: 60, textAlignVertical: 'top' as any, marginBottom: 20 }]} value={notes} onChangeText={setNotes} placeholder="How did you sleep?" placeholderTextColor={C.gray} multiline />

        <TouchableOpacity style={[S.btn, S.btnGrad]} onPress={saveSleep}>
          <Text style={{ color: '#FFF', fontWeight: '600', fontSize: 15 }}>Save sleep log</Text>
        </TouchableOpacity>
      </View>

      <Text style={S.sectionTitle}>Last 7 days</Text>
      <View style={[S.card, { marginBottom: 24 }]}>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {last7().map((d, i) => {
            const hrs = weekData[i];
            const isToday = d === today();
            return (
              <View key={d} style={{ flex: 1, alignItems: 'center', gap: 6 }}>
                <Text style={{ fontSize: 11, color: isToday ? C.accentLight : C.sub }}>{dayLabel(d)}</Text>
                <View style={{ width: '100%', height: 48, borderRadius: 8, backgroundColor: hrs > 0 ? C.gradEnd + '40' : '#12141F', justifyContent: 'center', alignItems: 'center', borderWidth: isToday ? 1 : 0, borderColor: C.accent }}>
                  <Text style={{ fontSize: 11, fontWeight: '600', color: hrs > 0 ? C.text : C.sub }}>{hrs > 0 ? `${(hrs / 60).toFixed(1)}h` : '—'}</Text>
                </View>
              </View>
            );
          })}
        </View>
      </View>

      {logs.length > 0 && (
        <>
          <Text style={S.sectionTitle}>Recent logs</Text>
          <View style={[S.card]}>
            {[...logs].reverse().slice(0, 5).map(l => (
              <View key={l.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.border }}>
                <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: C.gradEnd + '20', alignItems: 'center', justifyContent: 'center' }}>
                  <MaterialIcons name="bedtime" size={18} color={C.gradEnd} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 14, color: C.text }}>{fmtMins(l.duration)} • {l.bedtime} → {l.wakeTime}</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 }}>
                    <StarRating rating={l.quality} readonly />
                    <Text style={{ fontSize: 11, color: C.sub, marginLeft: 4 }}>{l.date}</Text>
                  </View>
                </View>
              </View>
            ))}
          </View>
        </>
      )}
    </ScrollView>
  );
};

// ─── TASKS ──────────────────────────────────────────────────
const TasksScreen = ({ tasks, setTasks }: { tasks: TaskItem[]; setTasks: React.Dispatch<React.SetStateAction<TaskItem[]>> }) => {
  const [title, setTitle] = useState('');
  const [priority, setPriority] = useState<'high' | 'medium' | 'low'>('medium');
  const [filter, setFilter] = useState<'open' | 'all' | 'done'>('open');

  const addTask = () => {
    if (!title.trim()) { showMsg('Oops: Enter a task title'); return; }
    setTasks(prev => [{ id: Date.now().toString(), title: title.trim(), priority, date: today(), completed: false }, ...prev]);
    setTitle(''); Keyboard.dismiss();
  };

  const filtered = tasks.filter(t => filter === 'open' ? !t.completed : filter === 'done' ? t.completed : true);
  const prioColor = { high: C.red, medium: C.amber, low: C.green };

  return (
    <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 20, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
      <Text style={{ fontSize: 14, color: C.sub, marginBottom: 20 }}>Manage your tasks and stay organized.</Text>

      <View style={[S.card, { marginBottom: 20 }]}>
        <TextInput style={[S.input, { marginBottom: 12 }]} value={title} onChangeText={setTitle} placeholder="What needs to be done?" placeholderTextColor={C.gray} onSubmitEditing={addTask} />
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 12 }}>
          <Text style={{ fontSize: 12, color: C.sub }}>Priority:</Text>
          {(['high', 'medium', 'low'] as const).map(p => (
            <TouchableOpacity key={p} style={[S.pill, { paddingHorizontal: 12, paddingVertical: 6 }, priority === p && { backgroundColor: prioColor[p], borderColor: prioColor[p] }]} onPress={() => setPriority(p)}>
              <Text style={{ fontSize: 12, fontWeight: '500', color: priority === p ? '#FFF' : C.sub, textTransform: 'capitalize' }}>{p}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <TouchableOpacity style={[S.btn, S.btnGrad]} onPress={addTask}><Text style={{ color: '#FFF', fontWeight: '600' }}>Add</Text></TouchableOpacity>
      </View>

      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 20 }}>
        {(['open', 'all', 'done'] as const).map(f => (
          <TouchableOpacity key={f} style={[S.pill, { flex: 1, paddingVertical: 10, alignItems: 'center' }, filter === f && S.pillActive]} onPress={() => setFilter(f)}>
            <Text style={{ fontSize: 14, fontWeight: '500', color: filter === f ? '#FFF' : C.sub, textTransform: 'capitalize' }}>{f}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <View>
        {filtered.length === 0 ? (
          <EmptyState icon={filter === 'done' ? 'emoji-events' : 'check-circle'} msg={filter === 'open' ? 'Nothing to do — enjoy your day! ✨' : filter === 'done' ? 'No completed tasks yet' : 'No tasks yet'} />
        ) : filtered.map(task => (
          <View key={task.id} style={[S.card, { flexDirection: 'row', alignItems: 'center', padding: 16, marginBottom: 10 }]}>
            <TouchableOpacity onPress={() => setTasks(prev => prev.map(t => t.id === task.id ? { ...t, completed: !t.completed } : t))} style={{ marginRight: 14 }}>
              <MaterialIcons name={task.completed ? 'check-circle' : 'radio-button-unchecked'} size={24} color={task.completed ? C.green : C.sub} />
            </TouchableOpacity>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 15, color: task.completed ? C.sub : C.text, textDecorationLine: task.completed ? 'line-through' : 'none' }}>{task.title}</Text>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 }}>
                <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: prioColor[task.priority] }} />
                <Text style={{ fontSize: 11, color: C.sub, textTransform: 'capitalize' }}>{task.priority}</Text>
                <Text style={{ fontSize: 11, color: C.gray }}>•</Text>
                <Text style={{ fontSize: 11, color: C.sub }}>{task.date}</Text>
              </View>
            </View>
            <TouchableOpacity onPress={() => setTasks(prev => prev.filter(t => t.id !== task.id))} hitSlop={8}>
              <MaterialIcons name="delete-outline" size={20} color={C.red} />
            </TouchableOpacity>
          </View>
        ))}
      </View>
    </ScrollView>
  );
};

// ─── SUGGESTIONS ────────────────────────────────────────────
const SuggestionsScreen = () => (
  <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>
    <Text style={{ fontSize: 14, color: C.sub, marginBottom: 24 }}>Personalized tips based on your screen time and sleep data.</Text>

    <Text style={S.sectionTitle}>Smart Suggestions</Text>
    <View style={{ marginBottom: 28 }}>
      {[
        { icon: 'balance', color: C.green, title: 'Healthy screen balance', desc: 'Try to keep your entertainment screen time under 2 hours per day. Balance productive and leisure screen activities.' },
        { icon: 'bedtime', color: C.gradEnd, title: 'Start tracking sleep', desc: 'Consistent sleep tracking helps identify patterns and improve your sleep quality over time.' },
        { icon: 'directions-walk', color: C.amber, title: 'Take a movement break', desc: 'Standing up and moving for 5 minutes every 30 minutes of screen time reduces fatigue and improves focus.' },
      ].map((s, i) => (
        <View key={i} style={[S.card, { flexDirection: 'row', gap: 16, marginBottom: 12 }]}>
          <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: s.color + '20', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <MaterialIcons name={s.icon as any} size={22} color={s.color} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 15, fontWeight: '600', color: C.text, marginBottom: 4 }}>{s.title}</Text>
            <Text style={{ fontSize: 13, color: C.sub, lineHeight: 18 }}>{s.desc}</Text>
          </View>
        </View>
      ))}
    </View>

    <Text style={S.sectionTitle}>General digital wellness tips</Text>
    <View style={[S.card]}>
      {[
        'Keep your phone away at least 1 hour before bedtime to improve sleep quality.',
        'Set phone-free zones — keep devices out of the bedroom and dining table.',
        'Follow the 20-20-20 rule: every 20 minutes, look at something 20 feet away for 20 seconds.',
        'Schedule regular digital detox days to reset your relationship with technology.',
        'Turn off non-essential notifications to reduce interruptions and improve focus.',
      ].map((tip, i) => (
        <View key={i} style={{ flexDirection: 'row', gap: 12, paddingVertical: 12, borderBottomWidth: i < 4 ? 1 : 0, borderBottomColor: C.border }}>
          <View style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: C.accent + '20', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}>
            <Text style={{ fontSize: 12, fontWeight: '700', color: C.accentLight }}>{i + 1}</Text>
          </View>
          <Text style={{ fontSize: 13, color: C.sub, lineHeight: 19, flex: 1 }}>{tip}</Text>
        </View>
      ))}
    </View>
  </ScrollView>
);

// ─── MAIN APP ───────────────────────────────────────────────
export default function Index() {
  const [user, setUser] = useState<User | null>(null);
  const [screen, setScreen] = useState<Screen>('dashboard');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sessions, setSessions] = useState<ScreenSession[]>([]);
  const [sleepLogs, setSleepLogs] = useState<SleepLog[]>([]);
  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const insets = useSafeAreaInsets();
  
  const [registeredUsers, setRegisteredUsers] = useState<MockUser[]>([]);

  if (!user) return <LoginScreen setUser={u => setUser(u)} registeredUsers={registeredUsers} setRegisteredUsers={setRegisteredUsers} />;

  const screenTitles: Record<Screen, string> = {
    'dashboard': 'Productivity', 'screen-time': 'Screen Time', 'activity': 'Activity Status',
    'sleep': 'Sleep Quality', 'tasks': 'Tasks', 'suggestions': 'Suggestions',
  };

  return (
    <View style={S.bg}>
      <Sidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} active={screen} onNav={setScreen} user={user} onLogout={() => { setUser(null); setSessions([]); setSleepLogs([]); setTasks([]); setScreen('dashboard'); }} />
      <View style={{ flex: 1, paddingTop: insets.top }}>
        <Header title={screenTitles[screen]} onMenu={() => setSidebarOpen(true)} />
        {screen === 'dashboard' && <DashboardScreen sessions={sessions} sleepLogs={sleepLogs} tasks={tasks} userName={user.name} />}
        {screen === 'screen-time' && <ScreenTimeScreen sessions={sessions} setSessions={setSessions} />}
        {screen === 'activity' && <ActivityScreen sessions={sessions} />}
        {screen === 'sleep' && <SleepScreen logs={sleepLogs} setLogs={setSleepLogs} />}
        {screen === 'tasks' && <TasksScreen tasks={tasks} setTasks={setTasks} />}
        {screen === 'suggestions' && <SuggestionsScreen />}
      </View>
    </View>
  );
}