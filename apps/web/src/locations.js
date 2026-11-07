// Administrative locations of Uzbekistan (region and district/city level).
// Uzbekistan's 14 top-level regions and their district/city choices.
// Cross-checked against the State Statistics Agency's current district series
// and official regional structure: https://siat.stat.uz/data/307/?lang=en
// and https://stat.uz/en/about/territorial-divisions
// Values stay in the app's existing Uzbek Latin format for API compatibility.
export const UZ_LOCATIONS = [
  { name:'Qoraqalpog‘iston Respublikasi', places:['Amudaryo','Beruniy','Bo‘zatov','Chimboy','Ellikqal’a','Kegeyli','Mo‘ynoq','Nukus','Nukus shahri','Qonliko‘l','Qorao‘zak','Qo‘ng‘irot','Shumanay','Taxiatosh','Taxtako‘pir','To‘rtko‘l','Xo‘jayli'] },
  { name:'Andijon viloyati', places:['Andijon','Andijon shahri','Asaka','Baliqchi','Bo‘z','Buloqboshi','Izboskan','Jalaquduq','Xo‘jaobod','Qo‘rg‘ontepa','Marhamat','Oltinko‘l','Paxtaobod','Shahrixon','Ulug‘nor','Xonobod','Xonobod shahri'] },
  { name:'Buxoro viloyati', places:['Olot','Buxoro','Buxoro shahri','G‘ijduvon','Jondor','Kogon','Kogon shahri','Qorako‘l','Qorovulbozor','Peshku','Romitan','Shofirkon','Vobkent'] },
  { name:'Farg‘ona viloyati', places:['Oltiariq','Bag‘dod','Beshariq','Buvayda','Dang‘ara','Farg‘ona','Farg‘ona shahri','Furqat','Qo‘shtepa','Quva','Rishton','So‘x','Toshloq','Uchko‘prik','O‘zbekiston','Yozyovon','Marg‘ilon','Marg‘ilon shahri','Quvasoy','Quvasoy shahri','Qo‘qon','Qo‘qon shahri'] },
  { name:'Jizzax viloyati', places:['Arnasoy','Baxmal','Do‘stlik','Forish','G‘allaorol','Sharof Rashidov','Mirzacho‘l','Paxtakor','Yangiobod','Zomin','Zafarobod','Zarbdor','Jizzax','Jizzax shahri'] },
  { name:'Namangan viloyati', places:['Chortoq','Chust','Kosonsoy','Mingbuloq','Namangan','Namangan shahri','Norin','Pop','To‘raqo‘rg‘on','Uchqo‘rg‘on','Uychi','Yangiqo‘rg‘on'] },
  { name:'Navoiy viloyati', places:['Konimex','Qiziltepa','Xatirchi','Navbahor','Karmana','Nurota','Tomdi','Uchquduq','Navoiy','Navoiy shahri','Zarafshon','Zarafshon shahri','G‘ozg‘on'] },
  { name:'Qashqadaryo viloyati', places:['Chiroqchi','Dehqonobod','G‘uzor','Qamashi','Qarshi','Qarshi shahri','Koson','Kasbi','Kitob','Mirishkor','Muborak','Nishon','Shahrisabz','Shahrisabz shahri','Yakkabog‘','Ko‘kdala'] },
  { name:'Samarqand viloyati', places:['Bulung‘ur','Ishtixon','Jomboy','Kattaqo‘rg‘on','Kattaqo‘rg‘on shahri','Qo‘shrabot','Narpay','Nurobod','Oqdaryo','Paxtachi','Payariq','Pastdarg‘om','Samarqand','Samarqand shahri','Toyloq','Urgut'] },
  { name:'Sirdaryo viloyati', places:['Oqoltin','Boyovut','Guliston','Guliston shahri','Xovos','Mirzaobod','Sardoba','Sayxunobod','Sirdaryo','Yangiyer','Yangiyer shahri','Shirin','Shirin shahri'] },
  { name:'Surxondaryo viloyati', places:['Angor','Bandixon','Boysun','Denov','Jarqo‘rg‘on','Qiziriq','Qumqo‘rg‘on','Muzrabot','Oltinsoy','Sariosiyo','Sherobod','Sho‘rchi','Termiz','Termiz shahri','Uzun'] },
  { name:'Toshkent viloyati', places:['Bekobod','Bekobod shahri','Bo‘stonliq','Bo‘ka','Chinoz','Qibray','Ohangaron','Ohangaron shahri','Oqqo‘rg‘on','Parkent','Piskent','Quyi Chirchiq','Zangiota','O‘rta Chirchiq','Yangiyo‘l','Yangiyo‘l shahri','Yuqori Chirchiq','Toshkent tumani','Nurafshon','Olmaliq','Olmaliq shahri','Angren','Angren shahri','Chirchiq','Chirchiq shahri'] },
  { name:'Xorazm viloyati', places:['Bog‘ot','Gurlan','Xonqa','Hazorasp','Xiva','Xiva shahri','Qo‘shko‘pir','Shovot','Urganch','Urganch shahri','Yangiariq','Yangibozor','Tuproqqal’a'] },
  { name:'Toshkent shahri', places:['Bektemir','Chilonzor','Yashnobod','Mirobod','Mirzo Ulug‘bek','Sergeli','Shayxontohur','Olmazor','Uchtepa','Yakkasaroy','Yunusobod','Yangihayot'] },
];

export const locationNames = UZ_LOCATIONS.map(x => x.name);
export const placesForRegion = region => UZ_LOCATIONS.find(x => x.name === region)?.places || [];
// Keep the API value unchanged while making districts and independent cities
// easy to distinguish in the select menu.
export const placeLabel = place => / (shahri|tumani)$/u.test(place) ? place : `${place} tumani`;
