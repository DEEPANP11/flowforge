// Main App Configuration

import { NhostProvider } from '@nhost/react';
import { nhost } from '../utils/nhost';
import type { AppProps } from 'next/app';
import '../styles/globals.css';

function MyApp({ Component, pageProps }: AppProps) {
  return (
    <NhostProvider nhost={nhost}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <Component {...pageProps} />
    </NhostProvider>
  );
}

export default MyApp;
