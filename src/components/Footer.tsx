import React from 'react';
import { Github, Mail, MapPin } from 'lucide-react';

export const Footer: React.FC = () => {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="bg-zinc-900/80 backdrop-blur border-t border-zinc-800 mt-16">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-8">
          {/* Brand */}
          <div>
            <div className="flex items-center gap-2 mb-4">
              <div className="bg-gradient-to-br from-blue-500 to-purple-600 rounded-lg p-2">
                <span className="font-bold text-white text-lg">M</span>
              </div>
              <span className="font-bold text-white text-lg">Muel</span>
            </div>
            <p className="text-zinc-400 text-sm">
              Discord 커뮤니티를 위한 YouTube 알림 봇
            </p>
          </div>

          {/* Quick Links */}
          <div>
            <h3 className="font-semibold text-white mb-4">빠른 링크</h3>
            <ul className="space-y-2 text-sm">
              <li>
                <a href="/" className="text-zinc-400 hover:text-white transition">
                  홈
                </a>
              </li>
              <li>
                <a href="/#features" className="text-zinc-400 hover:text-white transition">
                  기능
                </a>
              </li>
              <li>
                <a href="/dashboard" className="text-zinc-400 hover:text-white transition">
                  대시보드
                </a>
              </li>
            </ul>
          </div>

          {/* Resources */}
          <div>
            <h3 className="font-semibold text-white mb-4">리소스</h3>
            <ul className="space-y-2 text-sm">
              <li>
                <a
                  href="https://discord.gg/your-server"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-zinc-400 hover:text-white transition"
                >
                  Discord 서버
                </a>
              </li>
              <li>
                <a
                  href="https://github.com/your-repo"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-zinc-400 hover:text-white transition"
                >
                  GitHub
                </a>
              </li>
            </ul>
          </div>

          {/* Contact */}
          <div>
            <h3 className="font-semibold text-white mb-4">문의</h3>
            <div className="space-y-3 text-sm">
              <a
                href="mailto:support@muel.bot"
                className="text-zinc-400 hover:text-white transition flex items-center gap-2"
              >
                <Mail className="w-4 h-4" />
                support@muel.bot
              </a>
            </div>
          </div>
        </div>

        {/* Divider */}
        <div className="border-t border-zinc-800 pt-8">
          <div className="flex flex-col md:flex-row justify-between items-center">
            <p className="text-zinc-500 text-sm">
              © {currentYear} Muel. All rights reserved.
            </p>
            <div className="flex gap-4 mt-4 md:mt-0">
              <a
                href="https://github.com"
                target="_blank"
                rel="noopener noreferrer"
                className="text-zinc-400 hover:text-white transition"
              >
                <Github className="w-5 h-5" />
              </a>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
};
