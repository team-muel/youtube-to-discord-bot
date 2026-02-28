import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { LogOut, Menu, X } from 'lucide-react';
import { useState } from 'react';
import { apiFetch } from '../config';

interface NavigationProps {
  user: { id: string; username: string; avatar?: string | null } | null;
  onLogout: () => void;
}

export const Navigation: React.FC<NavigationProps> = ({ user, onLogout }) => {
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleLogout = async () => {
    await apiFetch('/api/auth/logout', { method: 'POST' });
    onLogout();
    navigate('/');
  };

  return (
    <nav className="bg-zinc-900/80 backdrop-blur border-b border-zinc-800 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          {/* Logo & Brand */}
          <Link to="/" className="flex items-center gap-2 hover:opacity-80 transition">
            <div className="bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg p-2">
              <span className="font-bold text-white text-lg">M</span>
            </div>
            <span className="font-bold text-white text-lg hidden sm:inline">Muel</span>
          </Link>

          {/* Desktop Menu */}
          <div className="hidden md:flex items-center gap-1">
            {user ? (
              <>
                <Link
                  to="/dashboard"
                  className="px-4 py-2 text-zinc-300 hover:text-white hover:bg-zinc-800/50 rounded-lg transition"
                >
                  대시보드
                </Link>
                <Link
                  to="/#features"
                  className="px-4 py-2 text-zinc-300 hover:text-white hover:bg-zinc-800/50 rounded-lg transition"
                >
                  기능
                </Link>
              </>
            ) : (
              <>
                <Link
                  to="/"
                  className="px-4 py-2 text-zinc-300 hover:text-white hover:bg-zinc-800/50 rounded-lg transition"
                >
                  홈
                </Link>
                <Link
                  to="/#features"
                  className="px-4 py-2 text-zinc-300 hover:text-white hover:bg-zinc-800/50 rounded-lg transition"
                >
                  기능
                </Link>
                <a
                  href="https://discord.com/api/oauth2/authorize?client_id=1476491781221646480&permissions=8&scope=bot%20applications.commands"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-4 py-2 text-zinc-300 hover:text-white hover:bg-zinc-800/50 rounded-lg transition"
                >
                  봇 초대
                </a>
              </>
            )}
          </div>

          {/* User Menu / Login Button */}
          <div className="hidden md:flex items-center gap-4">
            {user ? (
              <div className="flex items-center gap-3 pl-4 border-l border-zinc-700">
                {user.avatar && (
                  <img
                    src={`https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=32`}
                    alt={user.username}
                    className="w-8 h-8 rounded-full"
                  />
                )}
                <span className="text-sm text-zinc-300">{user.username}</span>
                <button
                  onClick={handleLogout}
                  className="p-2 text-zinc-400 hover:text-white hover:bg-zinc-800/50 rounded-lg transition"
                  title="로그아웃"
                >
                  <LogOut className="w-5 h-5" />
                </button>
              </div>
            ) : (
              <button
                onClick={() => navigate('/dashboard')}
                className="px-4 py-2 bg-gradient-to-r from-blue-500 to-purple-600 text-white rounded-lg hover:opacity-90 transition font-medium"
              >
                대시보드
              </button>
            )}
          </div>

          {/* Mobile Menu Button */}
          <button
            className="md:hidden p-2 text-zinc-400 hover:text-white"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          >
            {mobileMenuOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
        </div>

        {/* Mobile Menu */}
        {mobileMenuOpen && (
          <div className="md:hidden pb-4 bg-zinc-800/50 border-t border-zinc-700">
            <div className="flex flex-col gap-2">
              {user ? (
                <>
                  <Link
                    to="/dashboard"
                    className="px-4 py-2 text-zinc-300 hover:text-white hover:bg-zinc-700/50 rounded-lg transition block"
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    대시보드
                  </Link>
                  <Link
                    to="/#features"
                    className="px-4 py-2 text-zinc-300 hover:text-white hover:bg-zinc-700/50 rounded-lg transition block"
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    기능
                  </Link>
                  <button
                    onClick={() => {
                      handleLogout();
                      setMobileMenuOpen(false);
                    }}
                    className="px-4 py-2 text-zinc-300 hover:text-white hover:bg-zinc-700/50 rounded-lg transition text-left flex items-center gap-2"
                  >
                    <LogOut className="w-4 h-4" />
                    로그아웃
                  </button>
                </>
              ) : (
                <>
                  <Link
                    to="/"
                    className="px-4 py-2 text-zinc-300 hover:text-white hover:bg-zinc-700/50 rounded-lg transition block"
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    홈
                  </Link>
                  <Link
                    to="/#features"
                    className="px-4 py-2 text-zinc-300 hover:text-white hover:bg-zinc-700/50 rounded-lg transition block"
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    기능
                  </Link>
                  <a
                    href="https://discord.com/api/oauth2/authorize?client_id=1476491781221646480&permissions=8&scope=bot%20applications.commands"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-4 py-2 text-zinc-300 hover:text-white hover:bg-zinc-700/50 rounded-lg transition block"
                  >
                    봇 초대
                  </a>
                  <button
                    onClick={() => {
                      navigate('/dashboard');
                      setMobileMenuOpen(false);
                    }}
                    className="mx-4 px-4 py-2 bg-gradient-to-r from-blue-500 to-purple-600 text-white rounded-lg hover:opacity-90 transition font-medium w-[calc(100%-2rem)]"
                  >
                    대시보드
                  </button>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </nav>
  );
};
