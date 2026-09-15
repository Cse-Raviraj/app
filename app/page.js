'use client'

import { MessageCircleHeart } from 'lucide-react'
import { Toaster } from '@/components/ui/sonner'
import { AppProvider, useApp } from '@/components/app-context'
import Landing from '@/components/landing'
import AuthModal from '@/components/auth-modal'
import Finding from '@/components/finding'
import IncomingRequest from '@/components/incoming-request'
import { TopNav, BottomNav } from '@/components/nav'
import HomeScreen from '@/components/home'
import Chat from '@/components/chat'
import Chats from '@/components/chats'
import Feed from '@/components/feed'
import Me from '@/components/me'
import Communities from '@/components/communities'
import CallOverlay from '@/components/call-overlay'

function Shell() {
  const { ready, user, screen } = useApp()

  if (!ready) {
    return (
      <div className="grid min-h-dvh place-items-center bg-gradient-to-b from-violet-50 to-white">
        <div className="flex flex-col items-center gap-3">
          <MessageCircleHeart className="h-12 w-12 animate-pulse text-violet-600" />
          <p className="text-sm font-medium text-gray-500">Talk to Strangers</p>
        </div>
      </div>
    )
  }

  if (!user) {
    return (
      <>
        <Landing />
        <AuthModal />
        <Toaster position="top-center" richColors />
      </>
    )
  }

  return (
    <div className="min-h-dvh bg-gray-50">
      <TopNav />
      {screen !== 'chat' && (
        <main className="mx-auto max-w-2xl px-4 pt-5 md:pt-8 pb-28 md:pb-12">
          {screen === 'home' && <HomeScreen />}
          {screen === 'chats' && <Chats />}
          {screen === 'feed' && <Feed />}
          {screen === 'communities' && <Communities />}
          {screen === 'me' && <Me />}
        </main>
      )}
      {screen === 'chat' && <Chat />}
      {screen !== 'chat' && <BottomNav />}
      <Finding />
      <IncomingRequest />
      <AuthModal />
      <CallOverlay />
      <Toaster position="top-center" richColors />
    </div>
  )
}

export default function App() {
  return (
    <AppProvider>
      <Shell />
    </AppProvider>
  )
}
