const map = L.map('map').setView([35.1029, 138.8597], 15);

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
}).addTo(map);

const redIcon = L.divIcon({ className: 'smoking-icon icon-red', html: 'smoking_rooms', iconSize: [30, 30], iconAnchor: [15, 15] });
const blueIcon = L.divIcon({ className: 'smoking-icon icon-blue', html: 'smoking_rooms', iconSize: [30, 30], iconAnchor: [15, 15] });
const elecPurpleRedIcon = L.divIcon({ className: 'smoking-icon icon-elec-purple-red', html: 'smoking_rooms', iconSize: [30, 30], iconAnchor: [15, 15] });
const elecPurpleBlueIcon = L.divIcon({ className: 'smoking-icon icon-elec-purple-blue', html: 'smoking_rooms', iconSize: [30, 30], iconAnchor: [15, 15] });

const shopNearIcon = L.divIcon({ className: 'smoking-icon icon-shop-near', html: 'storefront', iconSize: [30, 30], iconAnchor: [15, 15] });
const shopFarIcon = L.divIcon({ className: 'smoking-icon icon-shop-far', html: 'storefront', iconSize: [30, 30], iconAnchor: [15, 15] });

const convNearIcon = L.divIcon({ className: 'smoking-icon icon-conv-near', html: 'local_convenience_store', iconSize: [30, 30], iconAnchor: [15, 15] });
const convFarIcon = L.divIcon({ className: 'smoking-icon icon-conv-far', html: 'local_convenience_store', iconSize: [30, 30], iconAnchor: [15, 15] });

const customNearIcon = L.divIcon({ className: 'smoking-icon icon-custom-near', html: 'add_location_alt', iconSize: [30, 30], iconAnchor: [15, 15] });
const customFarIcon = L.divIcon({ className: 'smoking-icon icon-custom-far', html: 'add_location_alt', iconSize: [30, 30], iconAnchor: [15, 15] });

const personIconHtml = `
    <div style="position: relative;">
        <div id="direction-cone" style="display: none; position: absolute; top: -33px; left: -13px; width: 0; height: 0; border-left: 30px solid transparent; border-right: 30px solid transparent; border-top: 50px solid rgba(52, 152, 219, 0.4); transform-origin: 30px 50px; pointer-events: none; z-index: -1;"></div>
        <div style="position: relative; width: 34px; height: 34px; background-color: #3498db; color: white; border-radius: 50%; display: flex; justify-content: center; align-items: center; box-shadow: 0 2px 5px rgba(0,0,0,0.5); border: 2px solid white; z-index: 1;">
            <span class="material-icons" style="font-size: 20px;">directions_walk</span>
        </div>
    </div>
`;
const personIcon = L.divIcon({ className: '', html: personIconHtml, iconSize: [34, 34], iconAnchor: [17, 17] });

const markerGroup = L.layerGroup().addTo(map);

let customPins = JSON.parse(localStorage.getItem('custom_smoking_areas')) || [];
const customPinGroup = L.layerGroup().addTo(map);
let isAddPinMode = false;

let userLocation = null;
let userCircle = null;
let userMarker = null;
let watchId = null;
let isFirstLocation = true;

let isPopupOpen = false;
map.on('popupopen', function() { isPopupOpen = true; });
map.on('popupclose', function() { isPopupOpen = false; });

// --- ルート制御・到着判定用変数 ---
let routingControl = null;
let navigatingDestination = null; // 現在案内中の目的地のLatLng
let hasNotifiedArrival = false;   // 到着通知をすでに表示したかどうか

// ★緑のルート上を白く塗るための変数
let routeCoordinates = [];        // 案内ルートのすべての座標データ
let maxReachedIndex = 0;          // ルート上で到達した最も先のポイント（インデックス）
let traveledPolyline = null;      // 白色の線そのもの

// ====== 到着モーダル制御機能 ======
function showArrivalModal() {
    const modal = document.getElementById('arrival-modal');
    if (modal) {
        modal.style.display = 'flex';
    }
}

function dismissArrivalModal() {
    const modal = document.getElementById('arrival-modal');
    if (modal) {
        modal.style.display = 'none';
    }
}

function confirmArrivalFinish() {
    dismissArrivalModal();
    clearRoute(); // 「ルート消去」ボタン押下時にルートを削除
}

// ====== ルート検索機能 ======
function showRouteTo(destLat, destLng) {
    let startLatLng = userLocation;
    if (!startLatLng) {
        startLatLng = map.getCenter();
    }

    if (routingControl !== null) {
        map.removeControl(routingControl);
    }

    routingControl = L.Routing.control({
        waypoints: [
            L.latLng(startLatLng.lat, startLatLng.lng),
            L.latLng(destLat, destLng)
        ],
        router: L.Routing.osrmv1({
            profile: 'foot' 
        }),
        lineOptions: {
            styles: [{ color: '#27ae60', weight: 6, opacity: 0.8 }]
        },
        addWaypoints: false,
        draggableWaypoints: false,
        show: true
    }).addTo(map);

    // ★ルートが計算されたら、そのルートの座標データを保存する
    routingControl.on('routesfound', function(e) {
        let routes = e.routes;
        routeCoordinates = routes[0].coordinates; // ルートの形を作るすべての点（座標）
        maxReachedIndex = 0; // 到達ポイントを初期化
        
        if (traveledPolyline) {
            map.removeLayer(traveledPolyline);
        }
        // 白色の軌跡ラインを準備（最初は空）
        traveledPolyline = L.polyline([], {
            color: 'white',
            weight: 7,
            opacity: 1.0,
            lineCap: 'round',
            lineJoin: 'round'
        }).addTo(map);
    });

    map.closePopup(); 

    navigatingDestination = L.latLng(destLat, destLng);
    hasNotifiedArrival = false;
    const cancelBtn = document.getElementById('cancel-route-btn');
    if (cancelBtn) cancelBtn.style.display = 'block';
}

// ルート消去用関数
function clearRoute() {
    if (routingControl !== null) {
        map.removeControl(routingControl);
        routingControl = null;
        
        navigatingDestination = null;
        hasNotifiedArrival = false;
        routeCoordinates = [];
        maxReachedIndex = 0;

        const cancelBtn = document.getElementById('cancel-route-btn');
        if (cancelBtn) cancelBtn.style.display = 'none';
        if (traveledPolyline) {
            map.removeLayer(traveledPolyline);
            traveledPolyline = null;
        }
    }
}

function handleOrientation(event) {
    let heading = null;
    if (event.webkitCompassHeading != null) {
        heading = event.webkitCompassHeading;
    } else if (event.absolute === true && event.alpha != null) {
        heading = 360 - event.alpha;
    } else if (event.alpha != null) {
        heading = 360 - event.alpha;
    }

    if (heading !== null) {
        const cone = document.getElementById('direction-cone');
        if (cone) {
            cone.style.display = 'block';
            cone.style.transform = `rotate(${heading}deg)`;
        }
    }
}

let compassInitialized = false;
function initCompass() {
    if (compassInitialized) return;
   
    if (typeof DeviceOrientationEvent !== 'undefined') {
        if (typeof DeviceOrientationEvent.requestPermission === 'function') {
            DeviceOrientationEvent.requestPermission()
            .then(permissionState => {
                if (permissionState === 'granted') {
                    window.addEventListener('deviceorientation', handleOrientation);
                    compassInitialized = true;
                    const btn = document.querySelector('.locate-btn');
                    if (btn) btn.style.color = '#3498db';
                }
            })
            .catch(console.error);
        } else {
            if ('ondeviceorientationabsolute' in window) {
                window.addEventListener('deviceorientationabsolute', handleOrientation);
            } else {
                window.addEventListener('deviceorientation', handleOrientation);
            }
            compassInitialized = true;
        }
    }
}

if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission !== 'function') {
    initCompass();
}

document.addEventListener('click', initCompass, { once: true });
document.addEventListener('touchstart', initCompass, { once: true });

function locateUser() {
    if (!navigator.geolocation) return;

    watchId = navigator.geolocation.watchPosition(
        (position) => {
            const lat = position.coords.latitude;
            const lng = position.coords.longitude;
            userLocation = L.latLng(lat, lng);

            if (isFirstLocation) {
                map.setView(userLocation, 16);
                isFirstLocation = false;
            }

            if (userCircle) {
                userCircle.setLatLng(userLocation);
            } else {
                userCircle = L.circle(userLocation, {
                    color: '#3498db', fillColor: '#3498db', fillOpacity: 0.1, radius: 500
                }).addTo(map);
            }

            if (userMarker) {
                userMarker.setLatLng(userLocation);
            } else {
                userMarker = L.marker(userLocation, {icon: personIcon}).addTo(map);
            }

            // --- 到着判定 ---
            if (navigatingDestination && !hasNotifiedArrival) {
                const distanceToDest = userLocation.distanceTo(navigatingDestination);
                if (distanceToDest <= 20) {
                    hasNotifiedArrival = true; 
                    showArrivalModal();        
                }
            }

            // ★ルート（緑色の線）のうえを歩いた分だけ白く塗る処理
            if (routingControl !== null && routeCoordinates.length > 0) {
                let closestIndex = maxReachedIndex;
                let minDistance = Infinity;
                
                // 現在到達しているポイントの前後で、最も現在地に近いルート上のポイントを探す
                let searchStart = Math.max(0, maxReachedIndex - 10);
                let searchEnd = Math.min(routeCoordinates.length, maxReachedIndex + 80);
                
                for (let i = searchStart; i < searchEnd; i++) {
                    let pt = routeCoordinates[i];
                    let dist = userLocation.distanceTo(L.latLng(pt.lat, pt.lng));
                    if (dist < minDistance) {
                        minDistance = dist;
                        closestIndex = i;
                    }
                }

                // ルート上の最も近い点が50メートル以内なら「ルート上を歩いている」とみなす
                if (minDistance <= 50) {
                    // より先に進んでいれば到達ポイントを更新
                    if (closestIndex > maxReachedIndex) {
                        maxReachedIndex = closestIndex;
                    }
                    
                    // スタート地点から現在到達したポイントまでの「緑のルートの座標」を切り出して白線にする
                    let traveledPathCoords = routeCoordinates.slice(0, maxReachedIndex + 1).map(pt => L.latLng(pt.lat, pt.lng));
                    
                    if (traveledPolyline) {
                        traveledPolyline.setLatLngs(traveledPathCoords);
                        traveledPolyline.bringToFront(); // 緑の線より上に表示
                    }
                }
            }
        },
        (error) => console.log("現在地が取得できません。"),
        { enableHighAccuracy: true, maximumAge: 0, timeout: 10000 }
    );
}

const locateControl = L.control({position: 'bottomright'});
locateControl.onAdd = function(map) {
    const btn = L.DomUtil.create('button', 'locate-btn');
    btn.innerHTML = '<span class="material-icons">my_location</span>';
    btn.style.backgroundColor = 'white';
    btn.style.border = 'none';
    btn.style.borderRadius = '50%';
    btn.style.width = '45px';
    btn.style.height = '45px';
    btn.style.cursor = 'pointer';
    btn.style.boxShadow = '0 2px 5px rgba(0,0,0,0.3)';
    btn.style.display = 'flex';
    btn.style.justifyContent = 'center';
    btn.style.alignItems = 'center';
    btn.style.marginBottom = '20px';
    btn.style.marginRight = '10px';
    btn.style.color = '#666';

    btn.onclick = function() {
        if (userLocation) {
            map.setView(userLocation, 16);
        } else {
            alert("現在地を取得中です。少しお待ちください。");
        }
        initCompass();
    };
    return btn;
};
locateControl.addTo(map);

// ====== 喫煙所データの取得 ======
async function loadSmokingAreas() {
    if (map.getZoom() < 13) return;
    if (isPopupOpen) return;

    const bounds = map.getBounds();
    const query = `[out:json][timeout:25];(node["amenity"="smoking_area"](${bounds.getSouth()},${bounds.getWest()},${bounds.getNorth()},${bounds.getEast()});node["shop"="tobacco"](${bounds.getSouth()},${bounds.getWest()},${bounds.getNorth()},${bounds.getEast()});node["shop"="convenience"](${bounds.getSouth()},${bounds.getWest()},${bounds.getNorth()},${bounds.getEast()}););out;`;
   
    const url = `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(query)}`;

    try {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`HTTP Error: ${response.status}`);
        }
        const data = await response.json();
       
        markerGroup.clearLayers();

        data.elements.forEach(element => {
            if (element.lat && element.lon) {
                const smokingLocation = L.latLng(element.lat, element.lon);
               
                const isShop = element.tags && element.tags.shop === 'tobacco';
                const isConv = element.tags && element.tags.shop === 'convenience';
               
                let name = '喫煙所';
                let distanceText = '';
               
                if (element.tags && element.tags.name) {
                    name = element.tags.name;
                } else if (isShop) {
                    name = 'たばこ店 (周辺に喫煙可能場所がある可能性があります)';
                } else if (isConv) {
                    name = 'コンビニエンスストア (店外に灰皿がある可能性があります)';
                }
               
                let isInsideCircle = false;
                if (userLocation) {
                    const distance = userLocation.distanceTo(smokingLocation);
                    distanceText = `<br><span style="color:#666; font-size: 13px;">現在地から: 約${Math.round(distance)}m</span>`;
                    if (distance <= 500) {
                        isInsideCircle = true;
                    }
                }

                let iconType = isInsideCircle ? redIcon : blueIcon;
                
                if (isShop) {
                    iconType = isInsideCircle ? shopNearIcon : shopFarIcon;
                } else if (isConv) {
                    iconType = isInsideCircle ? convNearIcon : convFarIcon;
                }

                const marker = L.marker(smokingLocation, {icon: iconType});
               
                let routeBtnHtml = `<br><button class="route-btn" onclick="showRouteTo(${element.lat}, ${element.lon})" style="margin-top: 10px; padding: 8px 12px; background-color: #27ae60; color: white; border: none; border-radius: 4px; cursor: pointer;">ここへのルートを検索</button>`;

                marker.bindPopup(`
                    <div style="font-size: 15px; font-weight: bold; margin-bottom: 5px;">${name}</div>
                    ${distanceText}
                    ${routeBtnHtml}
                `);
                markerGroup.addLayer(marker);
            }
        });
    } catch (error) {
        console.error("データの取得に失敗しました:", error);
    }
}

function updateCustomPinsDisplay() {
    customPinGroup.clearLayers();
    customPins.forEach((pin, index) => {
        const pinLocation = L.latLng(pin.lat, pin.lng);
        let isInsideCircle = false;
        let distanceText = '';

        if (userLocation) {
            const distance = userLocation.distanceTo(pinLocation);
            distanceText = `<br><span style="color:#666; font-size: 13px;">現在地から: 約${Math.round(distance)}m</span>`;
            if (distance <= 500) {
                isInsideCircle = true;
            }
        }
       
        let iconType = isInsideCircle ? customNearIcon : customFarIcon;

        const marker = L.marker([pin.lat, pin.lng], {icon: iconType});
        
        let routeBtnHtml = `<br><button class="route-btn" onclick="showRouteTo(${pin.lat}, ${pin.lng})" style="margin-top: 10px; padding: 8px 12px; background-color: #27ae60; color: white; border: none; border-radius: 4px; cursor: pointer;">ここへのルートを検索</button>`;

        marker.bindPopup(`
            <div style="font-size: 15px; font-weight: bold; margin-bottom: 5px;">${pin.name}</div>
            <div style="color:#666; font-size: 13px;">(あなたが見つけた喫煙所)</div>
            ${distanceText}
            ${routeBtnHtml}
            <br><button onclick="deleteCustomPin(${index})" style="margin-top: 10px; padding: 5px; background-color: #e74c3c; color: white; border: none; border-radius: 4px; cursor: pointer; font-size:12px;">このピンを削除</button>
        `);
        customPinGroup.addLayer(marker);
    });
}

function deleteCustomPin(index) {
    customPins.splice(index, 1);
    localStorage.setItem('custom_smoking_areas', JSON.stringify(customPins));
    updateCustomPinsDisplay();
    map.closePopup();
}

map.on('moveend', () => {
    loadSmokingAreas();
    updateCustomPinsDisplay();
});

locateUser();
updateCustomPinsDisplay();

document.getElementById('add-pin-btn').addEventListener('click', function() {
    isAddPinMode = !isAddPinMode;
    if (isAddPinMode) {
        this.innerHTML = '<span class="material-icons">cancel</span> キャンセル';
        this.style.backgroundColor = '#95a5a6';
        alert('マップ上の任意の場所をタップして、喫煙所を登録してください。');
        document.getElementById('map').style.cursor = 'crosshair';
    } else {
        this.innerHTML = '<span class="material-icons">push_pin</span> 新規喫煙所をマップに打つ';
        this.style.backgroundColor = 'white';
        this.style.color = 'black';
        document.getElementById('map').style.cursor = '';
    }
});

map.on('click', function(e) {
    if (isAddPinMode) {
        const pinName = prompt("喫煙所の名前を入力してください (例: 公園の灰皿):", "新しい喫煙所");
        if (pinName) {
            customPins.push({ lat: e.latlng.lat, lng: e.latlng.lng, name: pinName });
            localStorage.setItem('custom_smoking_areas', JSON.stringify(customPins));
            updateCustomPinsDisplay();
        }
        
        isAddPinMode = false;
        const btn = document.getElementById('add-pin-btn');
        btn.innerHTML = '<span class="material-icons">push_pin</span> 新規喫煙所をマップに打つ';
        btn.style.backgroundColor = 'white';
        btn.style.color = 'black';
        document.getElementById('map').style.cursor = '';
    }
});