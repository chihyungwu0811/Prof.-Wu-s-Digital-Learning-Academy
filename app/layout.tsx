import type { Metadata } from 'next';
import './globals.css';
import {LanguageProvider} from './i18n';
export const metadata:Metadata={title:'Prof. Wu’s Digital Learning Academy',description:'An academy for curious minds. Interactive engineering education, with learning access managed by your instructor.'};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="en"><body><LanguageProvider>{children}</LanguageProvider></body></html>}
