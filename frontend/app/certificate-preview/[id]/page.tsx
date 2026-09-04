import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Code2, Download, Share2, ShieldCheck, Search } from 'lucide-react'

// This would typically fetch from the database based on params.id
// Using mock data for demonstration
const mockCertificate = {
  id: 'fc3c6d24-7ecc-4bac-83b5-034d828c658b',
  recipientName: 'Kavya Chaudhari',
  courseName: 'Assessment',
  organizer: 'Indira Gandhi Delhi Technical University for Women (IGDTUW), Delhi is the Winner of Assessment of the Finance Literacy Quiz organized by the Preneurs.',
  issueDate: '16 Aug 2026, 09:42 AM EDT',
}

export default function CertificatePreviewPage({ params }: { params: Promise<{ id: string }> | any }) {
  // Use mock for layout
  const cert = mockCertificate

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex flex-col">
      {/* Top Navbar */}
      <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container flex h-14 items-center justify-between">
          <div className="flex items-center gap-2 font-bold text-lg">
            <Code2 className="h-6 w-6 text-primary" />
            <span>CodeSpectra</span>
          </div>
          <div className="hidden md:flex flex-1 max-w-md mx-8">
             <div className="relative w-full">
               <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
               <input
                 type="search"
                 placeholder="Search Opportunities..."
                 className="w-full rounded-full border border-border bg-muted/40 px-9 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
               />
             </div>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" className="hidden sm:flex rounded-full px-4 text-blue-600 border-blue-200 bg-blue-50 hover:bg-blue-100">
              For Business
            </Button>
            <Button asChild size="sm" className="rounded-full">
              <Link href="/login">Log In</Link>
            </Button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 flex flex-col items-center py-12 px-4">
        
        {/* Certificate Header Info */}
        <div className="w-full max-w-4xl mb-8 text-center md:text-left md:flex justify-between items-end">
          <div>
            <h1 className="text-3xl md:text-4xl font-extrabold text-foreground tracking-tight flex items-center justify-center md:justify-start gap-3">
              {cert.recipientName} earned a Certificate! 🎉
            </h1>
            <p className="mt-2 text-muted-foreground font-medium">
              Your achievement has been recognized. Share your success with the world!
            </p>
            
            <div className="mt-6 flex items-center gap-4 justify-center md:justify-start text-sm">
               <div className="h-12 w-12 rounded-full bg-red-100 flex items-center justify-center overflow-hidden shrink-0 border border-border">
                 <span className="text-[10px] font-black text-red-600 rotate-[-15deg] leading-none text-center">FINANCE<br/>QUIZ</span>
               </div>
               <div>
                 <p className="font-bold text-foreground">{cert.courseName}</p>
                 <p className="text-muted-foreground text-xs">Issued on: {cert.issueDate}</p>
               </div>
            </div>
          </div>
          
          <div className="mt-6 md:mt-0 flex items-center gap-3 justify-center">
            <Button variant="outline" className="gap-2 shadow-sm rounded-full bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800">
              <Download className="h-4 w-4" /> Download
            </Button>
            <Button className="gap-2 shadow-sm rounded-full bg-blue-600 hover:bg-blue-700 text-white">
              <Share2 className="h-4 w-4" /> Share
            </Button>
          </div>
        </div>

        {/* The Certificate Itself */}
        <div className="w-full max-w-4xl relative group">
          <div className="absolute -inset-1 bg-linear-to-r from-blue-500 to-purple-500 rounded-[22px] blur opacity-20 group-hover:opacity-30 transition duration-1000 group-hover:duration-200" />
          
          <Card className="relative bg-white dark:bg-slate-950 overflow-hidden border-2 border-blue-500 rounded-[20px] shadow-2xl p-0 aspect-[1.414/1] max-h-[800px] flex flex-col justify-center items-center text-center">
            
            {/* Geometric background elements (matching reference) */}
            <div className="absolute top-0 left-0 w-full h-full pointer-events-none opacity-20">
               {/* Simplified SVG poly shapes */}
               <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute bottom-0 left-0 w-1/3 h-1/2 text-blue-500 fill-current">
                 <polygon points="0,100 0,50 30,80 50,100" />
                 <polygon points="0,50 40,40 30,80" fill="currentColor" opacity="0.6" />
                 <polygon points="40,40 70,100 50,100 30,80" fill="currentColor" opacity="0.3" />
               </svg>
               <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="absolute top-1/4 right-0 w-1/4 h-2/3 text-blue-500 fill-current">
                 <polygon points="100,0 100,100 60,60" />
                 <polygon points="100,100 60,60 70,80" fill="currentColor" opacity="0.5" />
                 <polygon points="100,0 60,60 80,20" fill="currentColor" opacity="0.3" />
               </svg>
            </div>

            <div className="absolute top-8 left-8 flex items-center gap-2">
               <div className="h-8 w-8 rounded-full bg-blue-600 flex items-center justify-center text-white font-bold italic">CS</div>
               <span className="font-bold text-xl text-slate-800 dark:text-slate-200 tracking-tight">CodeSpectra</span>
            </div>

            <div className="absolute top-8 right-8">
               <div className="h-16 w-16 rounded-full bg-red-100 flex items-center justify-center border-2 border-dashed border-red-300">
                 <span className="text-[10px] font-black text-red-600 rotate-[-15deg] leading-none text-center opacity-70">FINANCE<br/>QUIZ</span>
               </div>
            </div>
            
            <div className="relative z-10 max-w-2xl px-12 mt-10">
              <h2 className="text-3xl md:text-5xl font-black text-blue-900 dark:text-blue-100 mb-12 uppercase tracking-wide">
                Certificate of Excellence
              </h2>
              
              <p className="text-xs md:text-sm text-slate-500 dark:text-slate-400 font-semibold mb-2 uppercase tracking-widest">
                This is to certify that
              </p>
              
              <h3 className="text-2xl md:text-4xl font-bold text-blue-800 dark:text-blue-200 mb-8 border-b-2 border-slate-200 dark:border-slate-800 pb-2 inline-block px-8">
                {cert.recipientName}
              </h3>
              
              <p className="text-sm md:text-base text-slate-700 dark:text-slate-300 leading-relaxed font-medium max-w-lg mx-auto">
                from <span className="text-blue-600 dark:text-blue-400 font-semibold">Indira Gandhi Delhi Technical University for Women (IGDTUW), Delhi</span> is the Winner of <span className="text-blue-600 dark:text-blue-400 font-semibold">Assessment</span> of the Finance Literacy Quiz organized by the Preneurs.
              </p>
            </div>

            <div className="absolute bottom-8 right-8 bg-white p-2 border border-slate-200 rounded-lg shadow-sm">
               {/* Fake QR Code */}
               <svg width="64" height="64" viewBox="0 0 100 100" fill="currentColor" className="text-slate-800">
                 <rect x="10" y="10" width="30" height="30" fill="none" stroke="currentColor" strokeWidth="10"/>
                 <rect x="60" y="10" width="30" height="30" fill="none" stroke="currentColor" strokeWidth="10"/>
                 <rect x="10" y="60" width="30" height="30" fill="none" stroke="currentColor" strokeWidth="10"/>
                 <rect x="20" y="20" width="10" height="10"/>
                 <rect x="70" y="20" width="10" height="10"/>
                 <rect x="20" y="70" width="10" height="10"/>
                 <path d="M50 50 h40 v40 h-40 z" fill="none" stroke="currentColor" strokeWidth="2" strokeDasharray="5,5"/>
                 <rect x="60" y="60" width="10" height="10"/>
                 <rect x="80" y="80" width="10" height="10"/>
                 <rect x="50" y="20" width="5" height="5"/>
                 <rect x="20" y="50" width="5" height="5"/>
                 <rect x="40" y="80" width="5" height="5"/>
               </svg>
            </div>

            <div className="absolute bottom-8 left-8 flex flex-col items-start gap-1">
              <div className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
                <ShieldCheck className="h-4 w-4" />
                <span className="text-[10px] font-medium uppercase tracking-wider">Verifiable Credential</span>
              </div>
              <span className="text-[9px] text-slate-400 dark:text-slate-500 font-mono">ID: {cert.id}</span>
            </div>
            
          </Card>
        </div>
      </main>
    </div>
  )
}
