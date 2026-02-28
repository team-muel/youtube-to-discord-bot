import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, AlertCircle, Zap, BarChart3, Shield } from 'lucide-react';

export const Landing: React.FC = () => {
  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      {/* Hero Section */}
      <section className="relative overflow-hidden py-20 md:py-32">
        <div className="absolute inset-0 bg-gradient-to-r from-blue-600/20 to-purple-600/20 blur-3xl"></div>
        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center">
            <div className="inline-block bg-gradient-to-r from-blue-500 to-purple-600 rounded-full p-1 mb-6">
              <div className="bg-zinc-950 rounded-full px-4 py-1 text-sm font-medium">
                🎉 YouTube 커뮤니티 알림 봇
              </div>
            </div>

            <h1 className="text-5xl md:text-7xl font-bold mb-6 bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
              Muel
            </h1>

            <p className="text-xl md:text-2xl text-zinc-300 mb-8 max-w-2xl mx-auto">
              YouTube 크리에이터의 새로운 게시글을 자동으로 감지하고 Discord 포럼에 공유하세요.
              <br />
              커뮤니티를 더 활발하게 만드는 봇
            </p>

            <div className="flex flex-col sm:flex-row gap-4 justify-center mb-12">
              <Link
                to="/dashboard"
                className="px-8 py-3 bg-gradient-to-r from-blue-500 to-purple-600 rounded-lg font-semibold hover:opacity-90 transition inline-flex items-center gap-2"
              >
                시작하기
                <ArrowRight className="w-5 h-5" />
              </Link>
              <a
                href="https://discord.com/api/oauth2/authorize?client_id=1476491781221646480&permissions=8&scope=bot%20applications.commands"
                target="_blank"
                rel="noopener noreferrer"
                className="px-8 py-3 border border-zinc-600 rounded-lg font-semibold hover:border-zinc-400 hover:text-zinc-300 transition"
              >
                봇 초대하기
              </a>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-4 md:gap-8 mt-12 pt-12 border-t border-zinc-800">
              <div>
                <div className="text-3xl md:text-4xl font-bold text-blue-400">1000+</div>
                <div className="text-zinc-400 text-sm md:text-base">활성 서버</div>
              </div>
              <div>
                <div className="text-3xl md:text-4xl font-bold text-purple-400">10초</div>
                <div className="text-zinc-400 text-sm md:text-base">감시 간격</div>
              </div>
              <div>
                <div className="text-3xl md:text-4xl font-bold text-pink-400">99.9%</div>
                <div className="text-zinc-400 text-sm md:text-base">가용성</div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-20 md:py-32 bg-zinc-900/50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-bold mb-4">주요 기능</h2>
            <p className="text-zinc-400 text-lg">Muel이 제공하는 강력한 기능들</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {/* Feature 1 */}
            <div className="bg-zinc-800/50 border border-zinc-700 rounded-lg p-6 hover:border-blue-500/50 transition group">
              <div className="w-12 h-12 bg-blue-500/20 rounded-lg flex items-center justify-center mb-4 group-hover:bg-blue-500/30 transition">
                <AlertCircle className="w-6 h-6 text-blue-400" />
              </div>
              <h3 className="text-lg font-semibold mb-2">실시간 알림</h3>
              <p className="text-zinc-400 text-sm">
                YouTube 크리에이터의 새 게시글을 10분마다 자동 감지
              </p>
            </div>

            {/* Feature 2 */}
            <div className="bg-zinc-800/50 border border-zinc-700 rounded-lg p-6 hover:border-purple-500/50 transition group">
              <div className="w-12 h-12 bg-purple-500/20 rounded-lg flex items-center justify-center mb-4 group-hover:bg-purple-500/30 transition">
                <Zap className="w-6 h-6 text-purple-400" />
              </div>
              <h3 className="text-lg font-semibold mb-2">자동 포스팅</h3>
              <p className="text-zinc-400 text-sm">
                Discord 포럼에 자동으로 스레드 생성 및 이미지 첨부
              </p>
            </div>

            {/* Feature 3 */}
            <div className="bg-zinc-800/50 border border-zinc-700 rounded-lg p-6 hover:border-pink-500/50 transition group">
              <div className="w-12 h-12 bg-pink-500/20 rounded-lg flex items-center justify-center mb-4 group-hover:bg-pink-500/30 transition">
                <BarChart3 className="w-6 h-6 text-pink-400" />
              </div>
              <h3 className="text-lg font-semibold mb-2">상세 로그</h3>
              <p className="text-zinc-400 text-sm">
                모든 활동 기록을 대시보드에서 실시간으로 추적
              </p>
            </div>

            {/* Feature 4 */}
            <div className="bg-zinc-800/50 border border-zinc-700 rounded-lg p-6 hover:border-green-500/50 transition group">
              <div className="w-12 h-12 bg-green-500/20 rounded-lg flex items-center justify-center mb-4 group-hover:bg-green-500/30 transition">
                <Shield className="w-6 h-6 text-green-400" />
              </div>
              <h3 className="text-lg font-semibold mb-2">안전하고 신뢰할 수 있음</h3>
              <p className="text-zinc-400 text-sm">
                OAuth2 인증 및 권한 최소화 원칙 준수
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section className="py-20 md:py-32">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-4xl md:text-5xl font-bold mb-4">어떻게 작동하나요?</h2>
            <p className="text-zinc-400 text-lg">3단계만에 시작할 수 있습니다</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {/* Step 1 */}
            <div className="text-center">
              <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center mx-auto mb-4 text-2xl font-bold">
                1
              </div>
              <h3 className="text-xl font-semibold mb-2">봇 초대</h3>
              <p className="text-zinc-400">Discord 서버에 Muel 봇을 초대합니다</p>
            </div>

            {/* Step 2 */}
            <div className="text-center">
              <div className="w-16 h-16 bg-gradient-to-br from-purple-500 to-pink-600 rounded-full flex items-center justify-center mx-auto mb-4 text-2xl font-bold">
                2
              </div>
              <h3 className="text-xl font-semibold mb-2">알림 설정</h3>
              <p className="text-zinc-400">
                대시보드에서 YouTube 채널 추가 및 포럼 선택
              </p>
            </div>

            {/* Step 3 */}
            <div className="text-center">
              <div className="w-16 h-16 bg-gradient-to-br from-pink-500 to-red-600 rounded-full flex items-center justify-center mx-auto mb-4 text-2xl font-bold">
                3
              </div>
              <h3 className="text-xl font-semibold mb-2">자동 실행</h3>
              <p className="text-zinc-400">
                새 게시글이 있으면 자동으로 포럼에 공유됨
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 md:py-32 bg-gradient-to-r from-blue-600/20 to-purple-600/20">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-4xl md:text-5xl font-bold mb-6">
            지금 시작하세요
          </h2>
          <p className="text-xl text-zinc-400 mb-8">
            Muel과 함께 Discord 커뮤니티를 한 단계 업그레이드하세요.
            설정은 단 5분이면 충분합니다.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link
              to="/dashboard"
              className="px-8 py-4 bg-gradient-to-r from-blue-500 to-purple-600 rounded-lg font-semibold hover:opacity-90 transition text-lg"
            >
              대시보드 입장하기
            </Link>
            <a
              href="https://discord.com/api/oauth2/authorize?client_id=1476491781221646480&permissions=8&scope=bot%20applications.commands"
              target="_blank"
              rel="noopener noreferrer"
              className="px-8 py-4 border border-zinc-600 rounded-lg font-semibold hover:border-zinc-400 transition text-lg"
            >
              봇 초대하기
            </a>
          </div>
        </div>
      </section>
    </div>
  );
};
