import { useState, useEffect } from 'react';
import { Activity, Link as LinkIcon, Settings, Terminal, Play, Plus, Trash2, CheckCircle2, XCircle, Edit2, LogIn, LogOut, Bell } from 'lucide-react';

export default function App() {
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [status, setStatus] = useState({ online: false, botName: null, guildsCount: 0 });
  const [sources, setSources] = useState([]);
  const [logs, setLogs] = useState([]);
  const [newUrl, setNewUrl] = useState('');
  const [newName, setNewName] = useState('');
  const [guilds, setGuilds] = useState([]);
  const [channels, setChannels] = useState([]);
  const [selectedGuildId, setSelectedGuildId] = useState('');
  const [selectedChannelId, setSelectedChannelId] = useState('');
  const [loadingGuilds, setLoadingGuilds] = useState(false);
  const [loadingChannels, setLoadingChannels] = useState(false);
  const [clientId, setClientId] = useState('');
  const [testUrl, setTestUrl] = useState('http://youtube.com/post/Ugkxr4ry97bvKkhD8_GmIvR7Oj7swnPq3Ca4?si=YPpWh7ZBLpSgkO-l');
  const [testResult, setTestResult] = useState('');
  const [addSourceStatus, setAddSourceStatus] = useState('');

  const fetchStatus = () => fetch('/api/status').then(res => res.json()).then(data => {
    if (!data.error) {
      setStatus(data);
      if (data.clientId) setClientId(data.clientId);
    }
  }).catch(console.error);
  const fetchSources = () => fetch('/api/sources').then(res => res.json()).then(data => {
    if (Array.isArray(data)) setSources(data);
  }).catch(console.error);
  const fetchLogs = () => fetch('/api/logs').then(res => res.json()).then(data => {
    if (Array.isArray(data)) setLogs(data);
  }).catch(console.error);

  const checkAuth = async () => {
    try {
      const res = await fetch('/api/auth/me');
      if (res.ok) {
        const data = await res.json();
        setUser(data.user);
      } else {
        setUser(null);
      }
    } catch (err) {
      setUser(null);
    } finally {
      setAuthLoading(false);
    }
  };

  useEffect(() => {
    checkAuth();
    
    const handleMessage = (event) => {
      if (event.data?.type === 'OAUTH_AUTH_SUCCESS') {
        checkAuth();
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  useEffect(() => {
    if (!user) return;
    
    fetchStatus();
    fetchSources();
    fetchLogs();
    
    const interval = setInterval(() => {
      fetchStatus();
      fetchLogs();
    }, 5000);
    return () => clearInterval(interval);
  }, [user]);

  const fetchGuilds = async () => {
    setLoadingGuilds(true);
    try {
      const res = await fetch('/api/discord/guilds');
      if (res.ok) {
        const data = await res.json();
        setGuilds(data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingGuilds(false);
    }
  };

  const fetchChannels = async (guildId) => {
    setLoadingChannels(true);
    try {
      const res = await fetch(`/api/discord/channels/${guildId}`);
      if (res.ok) {
        const data = await res.json();
        setChannels(data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingChannels(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'sources' && user) {
      fetchGuilds();
    }
  }, [activeTab, user]);

  useEffect(() => {
    if (selectedGuildId) {
      fetchChannels(selectedGuildId);
    } else {
      setChannels([]);
    }
  }, [selectedGuildId]);

  const handleLogin = async () => {
    try {
      const redirectUri = `${window.location.origin}/auth/callback`;
      const res = await fetch(`/api/auth/url?redirectUri=${encodeURIComponent(redirectUri)}`);
      const { url } = await res.json();
      
      window.open(url, 'oauth_popup', 'width=600,height=700');
    } catch (err) {
      console.error('Failed to get auth URL:', err);
      alert('로그인 URL을 가져오는 데 실패했습니다.');
    }
  };

  const handleLogout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    setUser(null);
  };

  if (authLoading) {
    return <div className="min-h-screen bg-zinc-950 flex items-center justify-center text-zinc-400">Loading...</div>;
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center font-sans">
        <div className="bg-zinc-900 border border-zinc-800 p-8 rounded-2xl max-w-md w-full text-center space-y-6">
          <div className="w-16 h-16 bg-indigo-500/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Terminal className="w-8 h-8 text-indigo-400" />
          </div>
          <h1 className="text-2xl font-bold text-zinc-100">Bot Dashboard</h1>
          <p className="text-zinc-400 text-sm">디스코드 계정으로 로그인하여 나만의 봇 설정을 관리하세요.</p>
          
          <button 
            onClick={handleLogin}
            className="w-full bg-[#5865F2] hover:bg-[#4752C4] text-white py-3 px-4 rounded-xl font-medium flex items-center justify-center gap-2 transition-colors"
          >
            <LogIn className="w-5 h-5" />
            Discord로 로그인
          </button>
        </div>
      </div>
    );
  }

  const handleAddSource = async (e) => {
    e.preventDefault();
    if (!newUrl || !newName || !selectedGuildId || !selectedChannelId) return;
    setAddSourceStatus('추가 중...');
    try {
      const guild = guilds.find(g => g.id === selectedGuildId);
      const channel = channels.find(c => c.id === selectedChannelId);
      
      const res = await fetch('/api/sources', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          url: newUrl, 
          name: newName,
          guildId: selectedGuildId,
          channelId: selectedChannelId,
          guildName: guild?.name,
          channelName: channel?.name
        })
      });
      if (res.ok) {
        setNewUrl('');
        setNewName('');
        setAddSourceStatus('성공적으로 추가되었습니다.');
        await fetchSources();
      } else {
        const data = await res.json();
        setAddSourceStatus(`추가 실패: ${data.error || '알 수 없는 오류'}`);
      }
    } catch (err) {
      setAddSourceStatus(`추가 실패: ${err.message}`);
    }
    setTimeout(() => setAddSourceStatus(''), 5000);
  };

  const handleDeleteSource = async (id) => {
    if (!confirm('정말로 이 알림을 삭제하시겠습니까?')) return;
    await fetch(`/api/sources/${id}`, { method: 'DELETE' });
    fetchSources();
  };

  const handleTestTrigger = async () => {
    if (!selectedChannelId) {
      setTestResult('오류: 채널을 먼저 선택해주세요.');
      return;
    }
    setTestResult('전송 중 (크롤링 진행 중)...');
    try {
      const res = await fetch('/api/test-trigger', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: testUrl, channelId: selectedChannelId })
      });
      const data = await res.json();
      if (res.ok) {
        setTestResult('성공: 봇이 성공적으로 글과 이미지를 긁어와 포럼에 작성했습니다!');
        fetchLogs();
      } else {
        setTestResult(`오류: ${data.error}`);
      }
    } catch (err) {
      setTestResult(`오류: ${err.message}`);
    }
  };

  // 채널 그룹핑 로직 (카테고리별 분류 및 정렬)
  const categories = channels.filter(c => c.type === 4).sort((a, b) => a.position - b.position);
  const textChannels = channels.filter(c => c.type !== 4).sort((a, b) => a.position - b.position);
  
  const groupedChannels = [];
  const uncategorized = textChannels.filter(c => !c.parentId);
  if (uncategorized.length > 0) {
    groupedChannels.push({ id: 'uncategorized', name: '카테고리 없음', channels: uncategorized });
  }
  categories.forEach(cat => {
    const catChannels = textChannels.filter(c => c.parentId === cat.id);
    if (catChannels.length > 0) {
      groupedChannels.push({ id: cat.id, name: cat.name, channels: catChannels });
    }
  });

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex font-sans">
      {/* Sidebar */}
      <aside className="w-64 border-r border-zinc-800 bg-zinc-900/50 flex flex-col">
        <div className="p-6 border-b border-zinc-800">
          <h1 className="text-xl font-bold tracking-tight flex items-center gap-2">
            <Terminal className="w-5 h-5 text-indigo-400" />
            Bot Dashboard
          </h1>
        </div>
        <nav className="flex-1 p-4 space-y-1">
          <button
            onClick={() => setActiveTab('dashboard')}
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === 'dashboard' ? 'bg-indigo-500/10 text-indigo-400' : 'text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-100'}`}
          >
            <Activity className="w-4 h-4" /> 대시보드
          </button>
          <button
            onClick={() => setActiveTab('sources')}
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === 'sources' ? 'bg-indigo-500/10 text-indigo-400' : 'text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-100'}`}
          >
            <Bell className="w-4 h-4" /> 알림 관리
          </button>
        </nav>
        <div className="p-4 border-t border-zinc-800 space-y-4">
          <div className="flex items-center gap-3">
            {user.avatar ? (
              <img src={`https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png`} alt="Avatar" className="w-8 h-8 rounded-full" />
            ) : (
              <div className="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center text-xs">{user.username.charAt(0)}</div>
            )}
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-zinc-200 truncate">{user.username}</div>
              <button onClick={handleLogout} className="text-xs text-zinc-500 hover:text-zinc-300 flex items-center gap-1 mt-0.5 transition-colors">
                <LogOut className="w-3 h-3" /> 로그아웃
              </button>
            </div>
          </div>
          <div className="flex items-center gap-2 text-sm pt-2 border-t border-zinc-800/50">
            {status.online ? (
              <><CheckCircle2 className="w-4 h-4 text-emerald-500" /> <span className="text-emerald-500 font-medium">봇 온라인</span></>
            ) : (
              <><XCircle className="w-4 h-4 text-rose-500" /> <span className="text-rose-500 font-medium">봇 오프라인</span></>
            )}
          </div>
          {status.botName && <div className="text-xs text-zinc-500">{status.botName}</div>}
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto p-8">
        <div className="max-w-4xl mx-auto space-y-8">
          
          {activeTab === 'dashboard' && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="flex items-center justify-between">
                <h2 className="text-2xl font-semibold tracking-tight">개요</h2>
                {clientId && (
                  <a 
                    href={`https://discord.com/api/oauth2/authorize?client_id=${clientId}&permissions=2147485696&scope=bot`}
                    target="_blank"
                    rel="noreferrer"
                    className="bg-[#5865F2] hover:bg-[#4752C4] text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors shadow-lg shadow-indigo-500/20"
                  >
                    <Plus className="w-4 h-4" /> 봇 초대하기
                  </a>
                )}
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
                  <div className="text-zinc-400 text-sm font-medium mb-1">상태</div>
                  <div className="text-2xl font-semibold flex items-center gap-2">
                    {status.online ? <span className="text-emerald-400">Online</span> : <span className="text-rose-400">Offline</span>}
                  </div>
                </div>
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
                  <div className="text-zinc-400 text-sm font-medium mb-1">연결된 서버</div>
                  <div className="text-2xl font-semibold">{status.guildsCount}개</div>
                </div>
                <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-5">
                  <div className="text-zinc-400 text-sm font-medium mb-1">추적 중인 소스</div>
                  <div className="text-2xl font-semibold">{sources.length}개</div>
                </div>
              </div>

              <div className="bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden">
                <div className="p-4 border-b border-zinc-800 bg-zinc-900/50">
                  <h3 className="font-medium">최근 로그</h3>
                </div>
                <div className="divide-y divide-zinc-800/50 max-h-96 overflow-y-auto">
                  {logs.length === 0 ? (
                    <div className="p-8 text-center text-zinc-500 text-sm">로그가 없습니다.</div>
                  ) : (
                    logs.map(log => (
                      <div key={log.id} className="p-3 px-4 flex items-start gap-3 text-sm hover:bg-zinc-800/20 transition-colors">
                        <span className="text-zinc-500 font-mono text-xs mt-0.5 whitespace-nowrap">
                          {new Date(log.created_at).toLocaleTimeString()}
                        </span>
                        <span className={`
                          ${log.type === 'error' ? 'text-rose-400' : ''}
                          ${log.type === 'success' ? 'text-emerald-400' : ''}
                          ${log.type === 'info' ? 'text-zinc-300' : ''}
                        `}>
                          {log.message}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'sources' && (
            <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div>
                <h2 className="text-2xl font-semibold tracking-tight">알림 관리</h2>
                <p className="text-zinc-400 text-sm mt-1">유튜브 채널에 새 글이 올라오면 지정한 디스코드 채널로 알림을 보냅니다.</p>
              </div>

              {/* Add Notification Form */}
              <form onSubmit={handleAddSource} className="bg-zinc-900 border border-zinc-800 rounded-xl p-6 space-y-4">
                <h3 className="text-lg font-medium text-zinc-200 flex items-center gap-2">
                  <Bell className="w-5 h-5 text-indigo-400" /> 새 알림 추가하기
                </h3>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-zinc-400 uppercase tracking-wider">유튜브 채널 이름</label>
                    <input 
                      type="text" 
                      value={newName}
                      onChange={e => setNewName(e.target.value)}
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500 transition-all"
                      placeholder="예: 침착맨 유튜브"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-zinc-400 uppercase tracking-wider">유튜브 커뮤니티 URL</label>
                    <input 
                      type="url" 
                      value={newUrl}
                      onChange={e => setNewUrl(e.target.value)}
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500 transition-all"
                      placeholder="https://youtube.com/..."
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-zinc-400 uppercase tracking-wider">디스코드 서버</label>
                    <select 
                      value={selectedGuildId}
                      onChange={e => setSelectedGuildId(e.target.value)}
                      disabled={loadingGuilds}
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500 disabled:opacity-50"
                    >
                      <option value="">{loadingGuilds ? '불러오는 중...' : '서버를 선택하세요'}</option>
                      {guilds.map(g => (
                        <option key={g.id} value={g.id}>
                          {g.name} {g.botInGuild ? '' : '(봇 초대 필요)'}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <label className="text-xs font-medium text-zinc-400 uppercase tracking-wider">알림을 받을 채널</label>
                    <select 
                      value={selectedChannelId}
                      onChange={e => setSelectedChannelId(e.target.value)}
                      disabled={!selectedGuildId || !guilds.find(g => g.id === selectedGuildId)?.botInGuild || loadingChannels}
                      className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500 disabled:opacity-50"
                    >
                      <option value="">{loadingChannels ? '불러오는 중...' : '채널을 선택하세요'}</option>
                      {groupedChannels.map(group => (
                        <optgroup key={group.id} label={group.name} className="font-semibold text-zinc-300 bg-zinc-900">
                          {group.channels.map(c => (
                            <option key={c.id} value={c.id} className="font-normal text-zinc-400 bg-zinc-950">
                              {c.name} ({c.type === 15 ? '포럼' : c.type === 5 ? '공지' : '텍스트'})
                            </option>
                          ))}
                        </optgroup>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="pt-2 flex items-center justify-between">
                  {selectedGuildId && guilds.find(g => g.id === selectedGuildId) && !guilds.find(g => g.id === selectedGuildId).botInGuild && clientId ? (
                    <div className="text-sm text-rose-400">
                      이 서버에는 아직 봇이 없습니다. 
                      <a 
                        href={`https://discord.com/api/oauth2/authorize?client_id=${clientId}&permissions=2147485696&scope=bot`} 
                        target="_blank" 
                        rel="noreferrer"
                        className="ml-2 underline text-indigo-400 hover:text-indigo-300"
                      >
                        봇 초대하기
                      </a>
                    </div>
                  ) : (
                    <div></div>
                  )}
                  <button 
                    type="submit" 
                    disabled={!newUrl || !newName || !selectedGuildId || !selectedChannelId}
                    className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white px-6 py-2.5 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors"
                  >
                    <Plus className="w-4 h-4" /> 알림 추가하기
                  </button>
                </div>
                
                {addSourceStatus && (
                  <div className={`text-sm p-3 rounded-lg border mt-4 ${addSourceStatus.includes('성공') ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' : addSourceStatus.includes('중') ? 'bg-indigo-500/10 border-indigo-500/20 text-indigo-400' : 'bg-rose-500/10 border-rose-500/20 text-rose-400'}`}>
                    {addSourceStatus}
                  </div>
                )}
              </form>

              {/* Notification List */}
              <div className="space-y-4">
                <h3 className="text-lg font-medium text-zinc-200">등록된 알림 목록</h3>
                {sources.length === 0 ? (
                  <div className="bg-zinc-900/50 border border-zinc-800 rounded-xl p-8 text-center text-zinc-500 text-sm">
                    등록된 알림이 없습니다. 위에서 새 알림을 추가해 보세요.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {sources.map(source => (
                      <div key={source.id} className="bg-zinc-900 border border-zinc-800 rounded-xl p-5 hover:border-zinc-700 transition-colors group relative">
                        <button 
                          onClick={() => handleDeleteSource(source.id)} 
                          className="absolute top-4 right-4 text-zinc-500 hover:text-rose-400 p-1.5 rounded-md hover:bg-rose-500/10 transition-colors opacity-0 group-hover:opacity-100"
                          title="삭제"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                        
                        <div className="flex items-center gap-2 mb-3">
                          {source.last_check_status === 'success' ? (
                            <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" title={`마지막 확인: ${new Date(source.last_check_at).toLocaleString()}`}></div>
                          ) : source.last_check_status === 'error' ? (
                            <div className="w-2 h-2 rounded-full bg-rose-400" title={source.last_check_error || '크롤링 에러'}></div>
                          ) : (
                            <div className="w-2 h-2 rounded-full bg-zinc-500" title="대기중"></div>
                          )}
                          <h4 className="font-medium text-zinc-200 truncate pr-8">{source.name}</h4>
                        </div>
                        
                        <div className="space-y-2 text-sm">
                          <div className="flex items-start gap-2 text-zinc-400">
                            <LinkIcon className="w-4 h-4 mt-0.5 shrink-0" />
                            <a href={source.url} target="_blank" rel="noreferrer" className="truncate hover:text-indigo-400 transition-colors">
                              {source.url}
                            </a>
                          </div>
                          <div className="flex items-center gap-2 text-zinc-400 bg-zinc-950/50 p-2 rounded-lg border border-zinc-800/50">
                            <div className="truncate flex-1">
                              <span className="text-zinc-500 text-xs">서버:</span> {source.guild_name || '알 수 없음'}
                            </div>
                            <div className="w-px h-4 bg-zinc-800"></div>
                            <div className="truncate flex-1">
                              <span className="text-zinc-500 text-xs">채널:</span> {source.channel_name || '알 수 없음'}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              
              {/* Test Trigger Section */}
              <div className="bg-indigo-950/30 border border-indigo-500/20 rounded-xl p-6 space-y-4 mt-8">
                <div className="flex items-center gap-2 mb-2">
                  <Play className="w-5 h-5 text-indigo-400" />
                  <h3 className="text-lg font-medium text-indigo-100">자동 크롤링 테스트</h3>
                </div>
                <p className="text-sm text-indigo-200/70">
                  아래에 유튜브 커뮤니티 게시글 링크를 입력하면, 봇이 해당 링크에 접속해 내용과 이미지를 자동으로 긁어와서 선택한 채널에 전송합니다.
                </p>
                
                <div className="space-y-3 pt-2">
                  <div className="flex gap-3">
                    <input 
                      type="text" 
                      value={testUrl}
                      onChange={e => setTestUrl(e.target.value)}
                      className="flex-1 bg-zinc-950/50 border border-indigo-500/30 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-500 transition-all font-mono"
                      placeholder="게시글 URL (예: http://youtube.com/post/...)"
                    />
                    <button 
                      onClick={handleTestTrigger}
                      disabled={!status.online || !selectedChannelId}
                      className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white px-4 py-2 rounded-lg text-sm font-medium flex items-center gap-2 transition-colors whitespace-nowrap"
                    >
                      <Play className="w-4 h-4" /> 테스트 전송
                    </button>
                  </div>
                  {!selectedChannelId && (
                    <p className="text-xs text-rose-400">테스트 전송을 하려면 위 '새 알림 추가하기' 폼에서 서버와 채널을 먼저 선택해주세요.</p>
                  )}
                  
                  {testResult && (
                    <div className={`text-sm p-3 rounded-lg border ${testResult.includes('성공') ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' : 'bg-rose-500/10 border-rose-500/20 text-rose-400'}`}>
                      {testResult}
                    </div>
                  )}
                </div>
              </div>

            </div>
          )}
        </div>
      </main>
    </div>
  );
}
