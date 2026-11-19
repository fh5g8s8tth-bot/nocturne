# Nocturne – álomnapló (v1)

Offline működő álomnapló PWA iPhone-ra. Sima HTML/CSS/JS, build eszköz és szerver nélkül.
Minden adat helyben, a böngésző IndexedDB-jében van, és JSON fájlba menthető.

## Funkciók
- Gyors rögzítés: nagy szövegmező, automatikus dátum, tisztaság (1–5), hangulat, típus. Piszkozatmentés gépelés közben.
- Címkék: emberek, helyek, dolgok/témák, javaslatokkal a korábbiakból.
- Napló: keresés, szűrés hangulat, típus és címke szerint.
- Naptár: a napok, amikor álmot rögzítettél.
- Statisztika: összesítés, havi bontás, sorozatok, hangulatok, leggyakoribb címkék.
- Álomtérkép: a címkék hálója, ujjal mozgatható és nagyítható.
- Biztonsági mentés: export és import JSON fájllal, emlékeztető 14 nap után.

## Elkülönítés más appoktól ugyanazon a domainen
- IndexedDB: `nocturne_db`, a tárak neve `nocturne_dreams` és `nocturne_meta`
- localStorage: `nocturne_draft` és `nocturne_backup_snooze`
- Service worker cache: `nocturne_cache_v1`. A régi cache-ek közül csak a `nocturne_cache_` előtagúakat törli.
- Service worker scope: `./`, vagyis csak a repó mappája (pl. `/nocturne/`)

## Új verzió kiadása
1. Emeld a `VERSION` értéket a `sw.js`-ben (pl. `v1.1`) és az `APP_VERSION` értéket a `js/backup.js`-ben.
2. Ha új fájlt adsz hozzá, vedd fel az `ASSETS` listába a `sw.js`-ben.
3. A zip neve: `Nocturne-v1.1.zip`. Kis változtatásnál tizedes lépés, nagyobbnál egész szám.
