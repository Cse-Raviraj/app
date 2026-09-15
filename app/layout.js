import './globals.css'
import { Providers } from './providers'

export const metadata = {
  title: 'Talk to Strangers — Meet someone new. Talk freely. Stay anonymous.',
  description:
    'Connect with a real person from anywhere and start a random conversation. Real people, real conversations, no bots.',
  applicationName: 'Talk to Strangers',
}

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#7C3AED',
}

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <script dangerouslySetInnerHTML={{ __html: 'window.addEventListener("error",function(e){if(e.error instanceof DOMException&&e.error.name==="DataCloneError"&&e.message&&e.message.includes("PerformanceServerTiming")){e.stopImmediatePropagation();e.preventDefault()}},true);' }} />
      </head>
      <body className="antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
