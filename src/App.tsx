import { useEffect, useMemo, useRef, useState } from "react";

const BASE_URL = "https://v2.samehadaku.how";
const PROXY = "https://cors.caliph.my.id/";
const headers = { "User-Agent": "Mozilla/5.0" };

type AnimeCard = { title: string; url: string; image: string; episode?: string; type?: string; score?: string; };
type TopAnime = { rank: number; title: string; url: string; image: string; score?: string; };
type Episode = { title: string; url: string; date: string; };
type DetailData = { title: string; image: string; description: string; episodes: Episode[]; info: Record<string, string>; };
type Stream = { server: string; url: string; };
type WatchData = { title: string; streams: Stream[]; };

const cleanText = (text: string) => text.replace(/samehadaku/gi, "Satrianime").replace(/Samehadaku/g, "Satrianime");

async function fetchHTML(targetUrl: string) {
  const url = targetUrl.startsWith("http") ? targetUrl : `${BASE_URL}${targetUrl}`;
  const res = await fetch(`${PROXY}${url}`, { headers });
  return await res.text();
}

async function animeterbaru(page = 1): Promise<AnimeCard[]> {
  const html = await fetchHTML(`/anime-terbaru/page/${page}/`);
  const doc = new DOMParser().parseFromString(html, "text/html");
  const data: AnimeCard[] = [];
  doc.querySelectorAll(".post-show ul li").forEach((e) => {
    const a = e.querySelector(".dtla h2 a");
    const img = e.querySelector(".thumb img");
    const episodeEl = Array.from(e.querySelectorAll(".dtla span")).find((s) => s.textContent?.includes("Episode"));
    
    const imgSrc = img?.getAttribute("src") || img?.getAttribute("data-src") || "";
    data.push({
      title: cleanText(a?.textContent?.trim() || ""),
      url: a?.getAttribute("href") || "",
      image: imgSrc,
      episode: episodeEl?.textContent?.replace("Episode", "").trim() || "",
    });
  });
  return data;
}

async function top10weekly(): Promise<TopAnime[]> {
  const html = await fetchHTML("/");
  const doc = new DOMParser().parseFromString(html, "text/html");
  const data: TopAnime[] = [];
  doc.querySelectorAll(".top10 .toplist li, .widget_senction .serieslist li").forEach((e, i) => {
    if (i >= 10) return;
    const a = e.querySelector("a");
    const img = e.querySelector("img");
    data.push({
      rank: i + 1,
      title: cleanText(a?.getAttribute("title") || a?.textContent?.trim() || ""),
      url: a?.getAttribute("href") || "",
      image: img?.getAttribute("src") || img?.getAttribute("data-src") || "",
      score: e.querySelector(".rating")?.textContent?.trim() || "9.0",
    });
  });
  // Fallback
  if (data.length === 0) {
    const latest = await animeterbaru(1);
    return latest.slice(0, 10).map((a, i) => ({ ...a, rank: i + 1, score: "9.0" }));
  }
  return data;
}

async function searchAnime(query: string): Promise<AnimeCard[]> {
  const html = await fetchHTML(`/?s=${encodeURIComponent(query)}`);
  const doc = new DOMParser().parseFromString(html, "text/html");
  const data: AnimeCard[] = [];
  doc.querySelectorAll(".animpost").forEach((e) => {
    data.push({
      title: cleanText(e.querySelector(".data .title h2")?.textContent?.trim() || ""),
      image: e.querySelector(".content-thumb img")?.getAttribute("src") || "",
      type: e.querySelector(".type")?.textContent?.trim() || "",
      score: e.querySelector(".score")?.textContent?.trim() || "",
      url: e.querySelector("a")?.getAttribute("href") || "",
    });
  });
  return data;
}

async function getDetail(link: string): Promise<DetailData> {
  const html = await fetchHTML(link);
  const doc = new DOMParser().parseFromString(html, "text/html");
  const episodes: Episode[] = [];
  doc.querySelectorAll(".lstepsiode ul li").forEach((e) => {
    episodes.push({
      title: cleanText(e.querySelector(".epsleft .lchx a")?.textContent?.trim() || ""),
      url: e.querySelector(".epsleft .lchx a")?.getAttribute("href") || "",
      date: e.querySelector(".epsleft .date")?.textContent?.trim() || "",
    });
  });
  const info: Record<string, string> = {};
  doc.querySelectorAll(".spe span").forEach((e) => {
    const t = e.textContent || "";
    if (t.includes(":")) {
      const [k, v] = t.split(":");
      info[k.trim().toLowerCase()] = cleanText(v.trim());
    }
  });
  
  const poster = doc.querySelector(".infoanime .thumb img")?.getAttribute("src") || 
                 doc.querySelector('meta[property="og:image"]')?.getAttribute("content") || "";
  
  return {
    title: cleanText((doc.querySelector("h1.entry-title")?.textContent || doc.querySelector("title")?.textContent || "").replace(" - Samehadaku", "").trim()),
    image: poster,
    description: cleanText(doc.querySelector(".entry-content p")?.textContent?.trim() || ""),
    episodes,
    info,
  };
}

async function getWatch(link: string): Promise<WatchData> {
  const targetUrl = link.startsWith("http") ? link : `${BASE_URL}${link}`;
  const html = await fetchHTML(targetUrl);
  const doc = new DOMParser().parseFromString(html, "text/html");
  const data: Stream[] = [];
  const servers = Array.from(doc.querySelectorAll("div#server > ul > li"));
  for (const li of servers) {
    const div = li.querySelector("div");
    const post = div?.getAttribute("data-post");
    const nume = div?.getAttribute("data-nume");
    const type = div?.getAttribute("data-type");
    const name = li.querySelector("span")?.textContent?.trim() || "Server";
    if (!post) continue;
    try {
      const body = new URLSearchParams({ action: "player_ajax", post, nume: nume || "", type: type || "" }).toString();
      const r = await fetch(`${PROXY}${BASE_URL}/wp-admin/admin-ajax.php`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/x-www-form-urlencoded", Referer: targetUrl },
        body,
      });
      const text = await r.text();
      const $$ = new DOMParser().parseFromString(text, "text/html");
      const iframe = $$.querySelector("iframe")?.getAttribute("src");
      if (iframe) data.push({ server: name, url: iframe });
    } catch {}
  }
  return { title: cleanText(doc.querySelector('h1[itemprop="name"]')?.textContent?.trim() || ""), streams: data };
}


const IconSearch = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>;
const IconPlay = () => <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>;
const IconX = () => <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m18 6-12 12"/><path d="m6 6 12 12"/></svg>;
const IconChevron = () => <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m15 18-6-6 6-6"/></svg>;
// const IconStar = () => <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>;

function RippleButton({ children, onClick, className = "", ...props }: any) {
  const [ripples, setRipples] = useState<Array<{x: number, y: number, id: number}>>([]);
  const btnRef = useRef<HTMLButtonElement>(null);

  const handleClick = (e: React.MouseEvent) => {
    const rect = btnRef.current?.getBoundingClientRect();
    if (rect) {
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const id = Date.now();
      setRipples(r => [...r, { x, y, id }]);
      setTimeout(() => setRipples(r => r.filter(ripple => ripple.id !== id)), 600);
    }
    onClick?.(e);
  };

  return (
    <button ref={btnRef} onClick={handleClick} className={`relative overflow-hidden active:scale-[0.98] transition-transform ${className}`} {...props}>
      {children}
      {ripples.map(r => (
        <span key={r.id} className="absolute animate-ping rounded-full bg-white/30" style={{ left: r.x - 10, top: r.y - 10, width: 20, height: 20 }} />
      ))}
    </button>
  );
}

export default function App() {
  const [view, setView] = useState<"landing" | "home" | "detail" | "watch">("landing");
  const [latest, setLatest] = useState<AnimeCard[]>([]);
  const [top10, setTop10] = useState<TopAnime[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [searchResults, setSearchResults] = useState<AnimeCard[]>([]);
  const [searching, setSearching] = useState(false);
  const [selectedAnime, setSelectedAnime] = useState<AnimeCard | null>(null);
  const [detail, setDetail] = useState<DetailData | null>(null);
  const [watchData, setWatchData] = useState<WatchData | null>(null);
  const [activeServer, setActiveServer] = useState(0);
  const [page, setPage] = useState(1);

  useEffect(() => {
    if (view === "landing") return;
    let mounted = true;
    (async () => {
      setLoading(true);
      try {
        const [latestData, topData] = await Promise.all([animeterbaru(page), top10weekly()]);
        // Enhance with real posters
        const enhanced = await Promise.all(latestData.slice(0, 12).map(async (anime) => {
          try {
            const d = await getDetail(anime.url);
            return { ...anime, image: d.image || anime.image };
          } catch { return anime; }
        }));
        if (mounted) {
          setLatest(enhanced);
          setTop10(topData);
        }
      } catch (e) { console.error(e); } 
      finally { if (mounted) setLoading(false); }
    })();
    return () => { mounted = false };
  }, [view, page]);

  useEffect(() => {
    if (!query) { setSearchResults([]); setSearching(false); return; }
    const t = setTimeout(async () => {
      setSearching(true);
      try { setSearchResults(await searchAnime(query)); } finally { setSearching(false); }
    }, 400);
    return () => clearTimeout(t);
  }, [query]);

  const openDetail = async (anime: AnimeCard) => {
    setSelectedAnime(anime);
    setView("detail");
    setDetail(null);
    window.scrollTo({ top: 0, behavior: "smooth" });
    try { setDetail(await getDetail(anime.url)); } catch (e) { console.error(e); }
  };

  const openWatch = async (ep: Episode) => {
    setView("watch");
    setWatchData(null);
    setActiveServer(0);
    window.scrollTo({ top: 0, behavior: "smooth" });
    try { setWatchData(await getWatch(ep.url)); } catch (e) { console.error(e); }
  };

  const heroAnime = useMemo(() => latest[0], [latest]);

  return (
    <div className="min-h-screen bg-[#E67E22]">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700;800;900&family=Outfit:wght@400;500;600&display=swap');
        * { font-family: 'Outfit', system-ui, sans-serif; -webkit-tap-highlight-color: transparent; }
        h1, h2, h3, .display { font-family: 'Poppins', sans-serif; }
        ::-webkit-scrollbar { width: 0; height: 0; }
        @keyframes float { 0%,100% { transform: translateY(0) } 50% { transform: translateY(-10px) } }
        @keyframes fadeIn { from { opacity: 0; transform: translateY(10px) } to { opacity: 1; transform: translateY(0) } }
        .animate-float { animation: float 6s ease-in-out infinite; }
        .animate-fadeIn { animation: fadeIn 0.5s ease-out; }
      `}</style>

      {/* LANDING */}
      {view === "landing" && (
        <div className="min-h-screen p-3 sm:p-4 md:p-6 lg:p-8">
          <div className="mx-auto max-w-[1400px]">
            {/* Main Card - Exact reference */}
            <div className="relative overflow-hidden rounded-[20px] sm:rounded-[28px] bg-[#FFFCF8] shadow-[0_20px_60px_rgba(0,0,0,0.3)] md:shadow-[0_30px_80px_rgba(0,0,0,0.3)]">
              {/* Manga bg */}
              <div className="absolute inset-0 opacity-[0.04] pointer-events-none">
                <img src="/images/manga-bg.png" alt="" className="h-full w-full object-cover" />
              </div>

              {/* Header */}
              <header className="relative z-30 flex items-center justify-between px-5 py-5 sm:px-8 sm:py-6 lg:px-12 lg:py-7">
                <div className="flex items-center">
                  <span className="text-[22px] sm:text-[26px] font-black leading-[0.9] tracking-tight">
                    <span className="text-[#E67E22]">CODER</span><br/>
                    <span className="text-[#1a1a1a]">SNIME</span>
                  </span>
                </div>
                <nav className="hidden md:flex items-center gap-8 lg:gap-12">
                  {["About", "Anime List", "Manga", "Community"].map((item) => (
                    <a key={item} href="#" onClick={(e) => { e.preventDefault(); if(item==="Anime List") setView("home"); }} className="text-[14px] font-medium text-[#444] hover:text-[#E67E22] transition-colors relative group">
                      {item}
                      <span className="absolute -bottom-1 left-0 w-0 h-0.5 bg-[#E67E22] transition-all group-hover:w-full" />
                    </a>
                  ))}
                </nav>
                <button className="md:hidden p-2 -mr-2 active:scale-90 transition-transform">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#333" strokeWidth="2"><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
                </button>
              </header>

              {/* Hero Content */}
              <div className="relative z-20 px-5 pb-10 sm:px-8 sm:pb-14 lg:px-12 lg:pb-16">
                <div className="grid lg:grid-cols-12 gap-8 lg:gap-4 items-center">
                  {/* Characters - Mobile top, Desktop left */}
                  <div className="lg:col-span-7 order-1 lg:order-1">
                    <div className="relative mx-auto max-w-[500px] lg:max-w-none">
                      {/* Characters trio */}
                      <div className="relative aspect-[4/3] lg:aspect-auto lg:h-[520px]">
                        <img src="/images/hero-trio.png" alt="Rimuru Yor Luffy" className="absolute inset-0 w-full h-full object-contain object-bottom drop-shadow-2xl animate-float" style={{ animationDelay: '0s' }} />
                      </div>
                      
                      {/* Dots */}
                      <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 flex gap-2.5 z-20">
                        <div className="w-2.5 h-2.5 rounded-full bg-[#ddd] transition-all" />
                        <div className="w-2.5 h-2.5 rounded-full bg-[#E67E22] w-6" />
                        <div className="w-2.5 h-2.5 rounded-full bg-[#ddd] transition-all" />
                      </div>
                    </div>
                  </div>

                  {/* Text - Mobile bottom, Desktop right */}
                  <div className="lg:col-span-5 order-2 lg:order-2">
                    <div className="max-w-[460px] mx-auto lg:mx-0 lg:ml-auto text-center lg:text-left">
                      <h1 className="display text-[28px] sm:text-[32px] lg:text-[42px] font-black leading-[1.1] tracking-[-0.02em] text-[#1a1a1a]">
                        STREAMING ANIME DENGAN
                        <br className="hidden sm:block" />
                        QUALITAS TINGGI HANYA DI
                        <br />
                        <span className="text-[#E67E22]">CODER</span>SNIME.
                      </h1>
                      
                      <p className="mt-4 text-[14px] sm:text-[15px] leading-relaxed text-[#666] lg:hidden">
                        Nonton ribuan anime sub Indo gratis.
                      </p>

                      <RippleButton onClick={() => setView("home")} className="mt-6 sm:mt-8 inline-flex items-center justify-center gap-2 rounded-full bg-[#E67E22] px-7 sm:px-8 py-3 sm:py-[13px] text-[14px] sm:text-[15px] font-semibold text-white shadow-[0_8px_20px_rgba(230,126,34,0.35)] hover:shadow-[0_12px_28px_rgba(230,126,34,0.45)] hover:-translate-y-0.5 active:translate-y-0 transition-all">
                        Tonton Sekarang
                      </RippleButton>

                      <div className="mt-10 sm:mt-14 flex items-center justify-center lg:justify-start gap-4">
                        <div className="flex -space-x-2.5">
                          {[1,2,3,4].map(i => (
                            <img key={i} src={`https://i.pravatar.cc/40?img=${20+i}`} alt="" className="w-8 h-8 sm:w-9 sm:h-9 rounded-full border-[2.5px] border-[#FFFCF8] object-cover shadow-sm" />
                          ))}
                        </div>
                        <div className="text-left">
                          <div className="text-[13px] font-semibold text-[#1a1a1a] leading-tight">15.2k+ Penonton</div>
                          <div className="text-[12px] text-[#888] leading-tight">Aktif sekarang</div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Second Card - Glassmorphism */}
            <div className="mt-6 sm:mt-8 relative">
              <div className="relative overflow-hidden rounded-[20px] sm:rounded-[28px] border border-white/30 bg-white/15 backdrop-blur-2xl shadow-[0_20px_60px_rgba(0,0,0,0.25)]">
                <div className="bg-[#FFFCF8]/95 backdrop-blur-xl">
                  {/* Top bar */}
                  <div className="flex items-center justify-between px-4 sm:px-6 py-3 border-b border-black/5">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] sm:text-[11px] tracking-[0.2em] text-[#999] uppercase">アニメンガヘブン</span>
                    </div>
                    <div className="flex items-center gap-2.5">
                      <div className="hidden sm:flex items-center gap-1.5 rounded-full bg-black/5 px-2.5 py-1">
                        <IconSearch />
                        <input placeholder="Search" className="w-16 bg-transparent text-[12px] outline-none placeholder:text-[#aaa]" />
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] text-[#999] hidden sm:inline">HI_108</span>
                        <div className="w-6 h-6 rounded-full bg-gradient-to-br from-orange-400 to-pink-400" />
                      </div>
                    </div>
                  </div>

                  <div className="px-4 sm:px-6 lg:px-10 py-6 sm:py-8 lg:py-10">
                    <div className="grid lg:grid-cols-12 gap-6 lg:gap-8 items-center">
                      {/* Left icons */}
                      <div className="hidden lg:flex lg:col-span-1 flex-row lg:flex-col gap-2.5 justify-center">
                        {[
                          { icon: "M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6", active: true },
                          { icon: "M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z", active: false },
                          { icon: "M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z", active: false },
                          { icon: "M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z", active: false },
                        ].map((item, i) => (
                          <button key={i} className={`w-9 h-9 rounded-full flex items-center justify-center transition-all active:scale-90 ${item.active ? "bg-[#E67E22] text-white shadow-md" : "bg-[#f5f0e8] text-[#8a7a68] hover:bg-[#ede4d3]"}`}>
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d={item.icon}/></svg>
                          </button>
                        ))}
                      </div>

                      {/* Content */}
                      <div className="lg:col-span-11 grid md:grid-cols-12 gap-6 items-center">
                        <div className="md:col-span-5">
                          <h2 className="display text-[32px] sm:text-[38px] lg:text-[48px] font-black leading-[0.95] tracking-[-0.02em] text-[#1a1a1a]">
                            IMMERSE IN
                            <br />
                            ANIME <span className="inline-block text-[#c9b8a6] text-[24px] align-super">学</span>
                            <br />
                            MANGA
                          </h2>
                          <div className="mt-6 sm:mt-8">
                            <p className="text-[12px] sm:text-[13px] text-[#8a7a68]">Explore, Read, and</p>
                            <p className="display text-[28px] sm:text-[32px] font-black leading-none text-[#1a1a1a]">ENJOY</p>
                          </div>
                        </div>

                        <div className="md:col-span-4 flex justify-center order-first md:order-none">
                          <div className="relative">
                            <div className="absolute -inset-8 bg-[#E67E22]/10 rounded-full blur-3xl" />
                            <img src="/images/nijika.png" alt="Nijika" className="relative w-[200px] sm:w-[240px] lg:w-[280px] h-auto object-contain drop-shadow-xl animate-float" style={{ animationDelay: '1s' }} />
                            {/* Stats */}
                            <div className="absolute bottom-4 -left-4 sm:-left-6 bg-white rounded-2xl px-3.5 py-2.5 shadow-xl border border-black/5 animate-fadeIn">
                              <div className="text-[9px] uppercase tracking-wide text-[#aaa] font-medium">Complete</div>
                              <div className="flex items-baseline gap-1.5 mt-0.5">
                                <span className="text-[20px] font-bold leading-none text-[#1a1a1a]">120</span>
                                <span className="text-[11px] text-[#888]">Episodes</span>
                              </div>
                            </div>
                            <div className="absolute top-8 -right-3 sm:-right-4 bg-white rounded-2xl px-3 py-2 shadow-xl border border-black/5 animate-fadeIn" style={{ animationDelay: '0.1s' }}>
                              <div className="text-[18px] font-bold leading-none text-[#1a1a1a]">350</div>
                              <div className="text-[9px] text-[#888] leading-tight">Chapters Free</div>
                            </div>
                          </div>
                        </div>

                        <div className="md:col-span-3">
                          <div className="text-center md:text-right">
                            <p className="text-[12px] sm:text-[13px] text-[#8a7a68]">Stream Anime and</p>
                            <p className="display text-[28px] sm:text-[32px] font-black leading-none text-[#1a1a1a]">ENJOY</p>
                            <div className="mt-5 sm:mt-6 space-y-2.5 max-w-[220px] mx-auto md:ml-auto md:mr-0">
                              <RippleButton onClick={() => setView("home")} className="group w-full flex items-center justify-between bg-[#1a1a1a] text-white rounded-full pl-5 pr-1.5 py-2.5 hover:bg-black transition-colors">
                                <span className="text-[13px] sm:text-[14px] font-medium">Let's Explore</span>
                                <span className="w-7 h-7 rounded-full bg-[#E67E22] flex items-center justify-center group-hover:rotate-45 transition-transform">
                                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5"><path d="M7 17L17 7M17 7H7M17 7v10"/></svg>
                                </span>
                              </RippleButton>
                              <RippleButton onClick={() => setView("home")} className="group w-full flex items-center justify-between bg-white text-[#1a1a1a] rounded-full pl-5 pr-1.5 py-2.5 shadow-md ring-1 ring-black/10 hover:shadow-lg transition-all">
                                <span className="text-[13px] sm:text-[14px] font-medium">Watch</span>
                                <span className="w-7 h-7 rounded-full bg-[#E67E22] flex items-center justify-center text-white">
                                  <IconPlay />
                                </span>
                              </RippleButton>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* HOME APP */}
      {view !== "landing" && (
        <div className="min-h-screen bg-[#FFFCF8]">
          <header className="sticky top-0 z-40 border-b border-[#f0e6d9] bg-[#FFFCF8]/90 backdrop-blur-2xl">
            <div className="mx-auto max-w-[1400px] flex items-center gap-3 sm:gap-4 h-[60px] sm:h-[68px] px-4 sm:px-6">
              <button onClick={() => setView("landing")} className="flex items-center active:scale-95 transition-transform">
                <span className="text-[20px] sm:text-[22px] font-black leading-[0.9] tracking-tight">
                  <span className="text-[#E67E22]">CODER</span>
                  <span className="text-[#1a1a1a]">SNIME</span>
                </span>
              </button>

              <div className="hidden lg:flex items-center gap-1 ml-4 bg-[#f5f0e8] rounded-full p-1">
                {["Terbaru", "Trending", "Movie"].map((t, i) => (
                  <button key={t} className={`px-3.5 py-1.5 text-[13px] font-medium rounded-full transition-all active:scale-95 ${i===0 ? "bg-white shadow-sm text-[#1a1a1a]" : "text-[#7a6e5f] hover:text-[#1a1a1a]"}`}>{t}</button>
                ))}
              </div>

              <div className="relative ml-auto flex-1 max-w-[320px] sm:max-w-[400px]">
                <div className="absolute left-3 top-1/2 -translate-y-1/2 text-[#a99a88] pointer-events-none"><IconSearch /></div>
                <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Cari anime..." className="w-full h-9 sm:h-10 pl-9 pr-8 rounded-full bg-white border border-[#ede4d3] text-[14px] outline-none focus:border-[#E67E22] focus:ring-2 focus:ring-[#E67E22]/20 transition-all" />
                {query && <button onClick={() => setQuery("")} className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-[#a99a88] hover:text-[#333] active:scale-90"><IconX /></button>}
                {(searching || searchResults.length > 0) && query && (
                  <div className="absolute top-[110%] left-0 right-0 bg-white rounded-2xl shadow-2xl border border-[#f0e6d9] max-h-[70vh] overflow-auto z-50 animate-fadeIn">
                    {searching ? <div className="p-4 text-center text-[#888] text-sm">Mencari...</div> : searchResults.slice(0,6).map((a,i) => (
                      <button key={i} onClick={() => { openDetail(a); setQuery(""); }} className="w-full flex gap-3 p-3 hover:bg-[#fff8f0] active:bg-[#fff0e0] transition-colors text-left">
                        <img src={a.image} alt="" className="w-12 h-16 rounded-lg object-cover bg-[#f5f0e8] flex-shrink-0" />
                        <div className="min-w-0 flex-1">
                          <div className="font-medium text-[14px] leading-snug line-clamp-2 text-[#1a1a1a]">{a.title}</div>
                          <div className="text-[12px] text-[#888] mt-1">{a.type || "TV"}</div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </header>

          {view === "home" && (
            <main className="mx-auto max-w-[1400px] px-4 sm:px-6 py-6 sm:py-8">
              {/* Hero */}
              {heroAnime && !loading && (
                <div className="relative mb-8 sm:mb-10 rounded-[20px] sm:rounded-[24px] overflow-hidden bg-[#1a1a1a]">
                  <div className="absolute inset-0">
                    <img src={heroAnime.image} alt="" className="w-full h-full object-cover opacity-40" />
                    <div className="absolute inset-0 bg-gradient-to-r from-[#1a1a1a] via-[#1a1a1a]/90 to-[#1a1a1a]/60 sm:to-transparent" />
                  </div>
                  <div className="relative p-6 sm:p-8 lg:p-10 min-h-[280px] sm:min-h-[320px] flex items-end sm:items-center">
                    <div className="max-w-xl">
                      <div className="inline-flex items-center gap-1.5 bg-[#E67E22] text-white px-2.5 py-1 rounded-full text-[11px] font-bold uppercase tracking-wide mb-3">
                        <span className="w-1.5 h-1.5 bg-white rounded-full animate-pulse" /> Baru
                      </div>
                      <h1 className="display text-[24px] sm:text-[32px] lg:text-[40px] font-black text-white leading-[1.1] mb-2">{heroAnime.title}</h1>
                      <p className="text-white/70 text-[14px] mb-4 line-clamp-2">Episode {heroAnime.episode} • Sub Indo • Satrianime</p>
                      <div className="flex gap-2.5">
                        <RippleButton onClick={() => openDetail(heroAnime)} className="bg-[#E67E22] text-white px-5 py-2.5 rounded-full font-semibold text-[14px] flex items-center gap-1.5 hover:bg-[#d35400] shadow-lg">
                          <IconPlay /> Tonton
                        </RippleButton>
                        <RippleButton onClick={() => openDetail(heroAnime)} className="bg-white/15 backdrop-blur text-white px-4 py-2.5 rounded-full font-medium text-[14px] hover:bg-white/25">Detail</RippleButton>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <div className="flex items-center justify-between mb-5">
                <div>
                  <h2 className="display text-[22px] sm:text-[24px] font-bold text-[#1a1a1a]">Anime Terbaru</h2>
                  <p className="text-[13px] text-[#888] mt-0.5">Update dari Satrianime</p>
                </div>
                <div className="flex items-center gap-2">
                  <button onClick={() => setPage(p => Math.max(1, p-1))} disabled={page===1} className="w-8 h-8 rounded-full bg-white border border-[#ede4d3] flex items-center justify-center text-[#666] disabled:opacity-40 active:scale-90 transition-all hover:border-[#E67E22] hover:text-[#E67E22]"><IconChevron /></button>
                  <span className="text-[13px] font-medium w-5 text-center text-[#444]">{page}</span>
                  <button onClick={() => setPage(p => p+1)} className="w-8 h-8 rounded-full bg-white border border-[#ede4d3] flex items-center justify-center text-[#666] active:scale-90 transition-all hover:border-[#E67E22] hover:text-[#E67E22] rotate-180"><IconChevron /></button>
                </div>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 sm:gap-4">
                {loading ? Array.from({length:12}).map((_,i) => (
                  <div key={i} className="animate-pulse">
                    <div className="aspect-[3/4] bg-[#f5f0e8] rounded-2xl" />
                    <div className="mt-2.5 h-3.5 bg-[#f5f0e8] rounded-full w-4/5" />
                    <div className="mt-1.5 h-3 bg-[#f5f0e8]/70 rounded-full w-3/5" />
                  </div>
                )) : latest.map((anime, i) => (
                  <button key={i} onClick={() => openDetail(anime)} className="group text-left active:scale-[0.97] transition-transform">
                    <div className="relative aspect-[3/4] rounded-2xl overflow-hidden bg-[#f5f0e8] ring-1 ring-black/5 group-hover:ring-[#E67E22]/50 transition-all">
                      <img src={anime.image} alt={anime.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" loading="lazy" />
                      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                      {anime.episode && <div className="absolute top-2 left-2 bg-black/80 backdrop-blur-md text-white text-[11px] font-bold px-2 py-1 rounded-lg">EP {anime.episode}</div>}
                      <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                        <div className="w-12 h-12 rounded-full bg-[#E67E22] text-white flex items-center justify-center shadow-xl scale-90 group-hover:scale-100 transition-transform"><IconPlay /></div>
                      </div>
                    </div>
                    <div className="mt-2.5 px-0.5">
                      <h3 className="font-semibold text-[13px] sm:text-[14px] leading-snug line-clamp-2 text-[#1a1a1a] group-hover:text-[#E67E22] transition-colors">{anime.title}</h3>
                      <p className="text-[11px] text-[#888] mt-1">Satrianime</p>
                    </div>
                  </button>
                ))}
              </div>

              {/* Top 10 Mobile */}
              <div className="mt-12 lg:hidden">
                <h3 className="display text-[20px] font-bold mb-4 text-[#1a1a1a]">Top 10 Minggu Ini</h3>
                <div className="flex gap-3 overflow-x-auto pb-2 -mx-4 px-4 scrollbar-hide">
                  {top10.slice(0,10).map(item => (
                    <button key={item.rank} onClick={() => openDetail(item)} className="flex-shrink-0 w-[110px] active:scale-95 transition-transform">
                      <div className="relative">
                        <img src={item.image} alt="" className="w-full aspect-[3/4] rounded-xl object-cover bg-[#f5f0e8]" />
                        <div className={`absolute -top-1.5 -left-1.5 w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-bold text-white shadow-md ${item.rank<=3 ? "bg-[#E67E22]" : "bg-[#333]"}`}>{item.rank}</div>
                      </div>
                      <div className="mt-2 text-[12px] font-medium line-clamp-2 leading-snug text-left">{item.title}</div>
                    </button>
                  ))}
                </div>
              </div>
            </main>
          )}

          {view === "detail" && selectedAnime && (
            <main className="mx-auto max-w-[1200px] px-4 sm:px-6 py-6">
              <button onClick={() => setView("home")} className="flex items-center gap-1 text-[14px] text-[#666] hover:text-[#1a1a1a] mb-5 active:scale-95 transition-transform"><IconChevron />Kembali</button>
              {!detail ? (
                <div className="animate-pulse">
                  <div className="flex flex-col sm:flex-row gap-6">
                    <div className="w-full sm:w-[240px] aspect-[3/4] bg-[#f5f0e8] rounded-2xl flex-shrink-0" />
                    <div className="flex-1 space-y-3">
                      <div className="h-8 bg-[#f5f0e8] rounded-xl w-3/4" />
                      <div className="h-4 bg-[#f5f0e8] rounded-lg w-full" />
                      <div className="h-4 bg-[#f5f0e8] rounded-lg w-5/6" />
                    </div>
                  </div>
                </div>
              ) : (
                <div className="animate-fadeIn">
                  <div className="flex flex-col sm:flex-row gap-6 lg:gap-8">
                    <div className="w-full sm:w-[220px] lg:w-[260px] flex-shrink-0">
                      <div className="aspect-[3/4] rounded-2xl overflow-hidden ring-1 ring-black/10 shadow-xl">
                        <img src={detail.image || selectedAnime.image} alt="" className="w-full h-full object-cover" />
                      </div>
                      <RippleButton onClick={() => detail.episodes[0] && openWatch(detail.episodes[0])} className="w-full mt-4 bg-[#E67E22] text-white py-3 rounded-2xl font-semibold flex items-center justify-center gap-2 shadow-lg shadow-[#E67E22]/25 hover:bg-[#d35400]">
                        <IconPlay />Tonton Eps 1
                      </RippleButton>
                    </div>
                    <div className="flex-1 min-w-0">
                      <h1 className="display text-[26px] sm:text-[32px] lg:text-[36px] font-black leading-[1.15] text-[#1a1a1a]">{detail.title}</h1>
                      <div className="flex flex-wrap gap-1.5 mt-3">
                        {Object.values(detail.info).slice(0,4).map((v,i) => <span key={i} className="px-2.5 py-1 bg-[#f5f0e8] rounded-full text-[12px] text-[#555]">{v}</span>)}
                        <span className="px-2.5 py-1 bg-[#fff0e0] text-[#E67E22] rounded-full text-[12px] font-medium">Satrianime</span>
                      </div>
                      <p className="mt-4 text-[14px] leading-relaxed text-[#555] line-clamp-4 sm:line-clamp-none">{detail.description || "Streaming di Codersnime dengan subtitle Indonesia."}</p>
                      
                      <div className="mt-8">
                        <h2 className="font-bold text-[18px] mb-3 text-[#1a1a1a]">Episode ({detail.episodes.length})</h2>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-[400px] overflow-auto pr-1">
                          {detail.episodes.map((ep,i) => (
                            <button key={i} onClick={() => openWatch(ep)} className="flex items-center justify-between p-3.5 bg-white hover:bg-[#fff8f0] active:bg-[#fff0e0] border border-[#f0e6d9] rounded-xl text-left transition-colors group">
                              <div className="min-w-0 flex-1">
                                <div className="font-medium text-[14px] truncate group-hover:text-[#E67E22] text-[#1a1a1a]">{ep.title}</div>
                                <div className="text-[12px] text-[#888] mt-0.5">{ep.date}</div>
                              </div>
                              <div className="w-8 h-8 rounded-full bg-[#fff0e0] group-hover:bg-[#E67E22] text-[#E67E22] group-hover:text-white flex items-center justify-center ml-3 flex-shrink-0 transition-colors"><IconPlay /></div>
                            </button>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </main>
          )}

          {view === "watch" && (
            <main className="mx-auto max-w-[1400px] px-4 sm:px-6 py-5">
              <button onClick={() => setView("detail")} className="flex items-center gap-1 text-[14px] text-[#666] hover:text-[#1a1a1a] mb-4 active:scale-95"><IconChevron />Kembali</button>
              {!watchData ? (
                <div className="aspect-video bg-[#f5f0e8] rounded-2xl animate-pulse" />
              ) : (
                <div className="animate-fadeIn">
                  <div className="aspect-video bg-black rounded-2xl overflow-hidden shadow-2xl">
                    {watchData.streams[activeServer] ? (
                      <iframe src={watchData.streams[activeServer].url} className="w-full h-full" allowFullScreen allow="autoplay" title={watchData.title} />
                    ) : <div className="w-full h-full flex items-center justify-center text-white/50">Memuat...</div>}
                  </div>
                  <div className="mt-4">
                    <h1 className="font-bold text-[18px] sm:text-[20px] text-[#1a1a1a]">{watchData.title}</h1>
                    <div className="flex flex-wrap gap-1.5 mt-3">
                      {watchData.streams.map((s,i) => (
                        <button key={i} onClick={() => setActiveServer(i)} className={`px-3 py-1.5 rounded-full text-[12px] font-medium transition-all active:scale-95 ${i===activeServer ? "bg-[#E67E22] text-white shadow" : "bg-[#f5f0e8] text-[#555] hover:bg-[#ede4d3]"}`}>{s.server}</button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </main>
          )}

          <footer className="border-t border-[#f0e6d9] mt-12 py-6 text-center">
            <div className="text-[13px] text-[#888]">© 2025 <span className="font-bold text-[#1a1a1a]"><span className="text-[#E67E22]">CODER</span>SNIME</span> • Powered by Satrianime</div>
          </footer>
        </div>
      )}
    </div>
  );
}
// Zod Schema
export const Schema = {
    "commentary": "Codersnime v2 - Perfect match to reference with Rimuru, Yor, Luffy, and Nijika characters. Fully mobile-friendly with tap animations, ripple effects, and real anime posters from detail pages. Light theme with exact orange #E67E22.",
    "template": "next-forge",
    "title": "Codersnime",
    "description": "Streaming anime dengan UI persis referensi, karakter Rimuru/Yor/Luffy, mobile optimized dengan animasi tap, dan poster anime asli.",
    "additional_dependencies": [],
    "has_additional_dependencies": false,
    "install_dependencies_command": "",
    "port": 3000,
    "file_path": "pages/index.tsx",
    "code": "<see code above>"
}