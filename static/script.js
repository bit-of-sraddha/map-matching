// Mapbox access token
mapboxgl.accessToken = MAPBOX_TOKEN;

// Initialize the map
const map = new mapboxgl.Map({
    container: 'map',
    style: 'mapbox://styles/mapbox/streets-v11', // Default style
    center: [78.9629, 20.5937], // Default center (e.g., Bangalore)
    zoom: 5,
    pitch: 0, // Initial pitch (0 for 2D)
});
let startMarker = null;
let endMarker = null;
let routeData = []; // Store route data for toll calculation

function updateMarkers(startCoords, endCoords) {
    // Remove existing markers if they exist
    if (startMarker) startMarker.remove();
    if (endMarker) endMarker.remove();

    // Add new markers
    startMarker = new mapboxgl.Marker({ color: '#4CAF50' }) // Green for start
        .setLngLat([startCoords.longitude, startCoords.latitude])
        .addTo(map);

    endMarker = new mapboxgl.Marker({ color: '#F44336' }) // Red for end
        .setLngLat([endCoords.longitude, endCoords.latitude])
        .addTo(map);
}

// Track the state of 3D buildings and highway highlights
let is3DBuildingsVisible = false;
let isHighwayHighlighted = false;

// Toggle between 2D and 3D
function toggle2D3D() {
    const pitch = map.getPitch();
    map.setPitch(pitch === 0 ? 45 : 0); // Toggle between 0 (2D) and 45 (3D)
}

// Toggle 3D buildings
function toggle3DBuildings() {
    is3DBuildingsVisible = !is3DBuildingsVisible;
    update3DBuildings();
}

// Add or remove 3D buildings layer
function update3DBuildings() {
    if (is3DBuildingsVisible) {
        if (!map.getLayer('3d-buildings')) {
            map.addLayer({
                'id': '3d-buildings',
                'source': 'composite',
                'source-layer': 'building',
                'type': 'fill-extrusion',
                'minzoom': 15,
                'paint': {
                    'fill-extrusion-color': '#aaa',
                    'fill-extrusion-height': [
                        'interpolate',
                        ['linear'],
                        ['zoom'],
                        15,
                        0,
                        15.05,
                        ['get', 'height']
                    ],
                    'fill-extrusion-base': [
                        'interpolate',
                        ['linear'],
                        ['zoom'],
                        15,
                        0,
                        15.05,
                        ['get', 'min_height']
                    ],
                    'fill-extrusion-opacity': 0.6
                }
            });
        }
    } else {
        if (map.getLayer('3d-buildings')) {
            map.removeLayer('3d-buildings');
        }
    }
}

// Highlight highways and service roads
function highlightHighways() {
    isHighwayHighlighted = !isHighwayHighlighted;
    updateHighwayHighlight();
}

// Add or remove highway and service road layers
function updateHighwayHighlight() {
    if (isHighwayHighlighted) {
        if (!map.getLayer('highway-layer')) {
            map.addSource('highway-source', {
                type: 'vector',
                url: 'mapbox://mapbox.mapbox-streets-v8'
            });
            map.addLayer({
                'id': 'highway-layer',
                'type': 'line',
                'source': 'highway-source',
                'source-layer': 'road',
                'filter': ['in', 'class', 'motorway', 'trunk', 'primary'],
                'paint': {
                    'line-color': '#ff0000',
                    'line-width': 2
                }
            });
            map.addLayer({
                'id': 'service-road-layer',
                'type': 'line',
                'source': 'highway-source',
                'source-layer': 'road',
                'filter': ['in', 'class', 'secondary', 'tertiary', 'service'],
                'paint': {
                    'line-color': '#00ff00',
                    'line-width': 2
                }
            });
        }
    } else {
        if (map.getLayer('highway-layer')) {
            map.removeLayer('highway-layer');
            map.removeLayer('service-road-layer');
            map.removeSource('highway-source');
        }
    }
}

// Change map style based on user selection
function changeMapStyle() {
    const selectedStyle = document.getElementById('map-style-select').value;
    map.setStyle(selectedStyle, { diff: false });

    // Reapply custom layers after the style changes
    map.once('style.load', () => {
        if (is3DBuildingsVisible) update3DBuildings();
        if (isHighwayHighlighted) updateHighwayHighlight();
        addTollDataLayer(); // Re-add toll data after style change
    });
}

// Track the current rotation angle
let currentRotationAngle = 0;

function rotateMap() {
    currentRotationAngle = (currentRotationAngle + 90) % 360;
    map.easeTo({
        bearing: currentRotationAngle,
        duration: 2000,
        easing: (t) => t,
    });

    document.getElementById('rotation-degree').textContent = `${currentRotationAngle}°`;

    const compassIcon = document.querySelector('.compass-icon');
    compassIcon.classList.add('rotate');
    setTimeout(() => {
        compassIcon.classList.remove('rotate');
    }, 2000); // Match the duration of the map rotation
}

let isRoutePanelVisible = false;
let routePanelResizeHandler = null;
function toggleRoutePanel() {
    const panelContainer = document.getElementById('route-panel-container');
    const compareBtn = document.getElementById('compare-tolls-btn');
    
    isRoutePanelVisible = !isRoutePanelVisible;
    
    if (isRoutePanelVisible) {
        panelContainer.style.display = 'block';
        compareBtn.textContent = 'Hide Route Comparison';
        // Show first route by default if routes exist
        if (routeData && routeData.length > 0) {
            showRouteDetails(0);
        }
    } else {
        panelContainer.style.display = 'none';
        compareBtn.textContent = 'Compare All Route Tolls';
        // Remove all toll highlights when hiding
        for (let i = 0; i < 3; i++) {
            removeTollHighlights(i);
        }
    }
}

// Toggle sidebar
function toggleSidebar() {
    const sidebar = document.getElementById('sidebar');
    sidebar.classList.toggle('collapsed');
}

// Global variable to store the toll points data
let tollPointsData = [];

// Add toll data to the map
function addTollDataLayer() {
    // Check if the layer already exists to avoid duplicates
    if (map.getLayer('toll-points')) return;

    // Add the toll data source
    map.addSource('toll-data', {
        type: 'geojson',
        data: '/static/toll_data.geojson' // Path to your GeoJSON file
    });

    // Fetch and store toll data for later use
    fetch('/static/toll_data.geojson')
        .then(response => response.json())
        .then(data => {
            tollPointsData = data.features || [];
        })
        .catch(error => console.error('Error loading toll data:', error));

    // Add a layer for toll points
    map.addLayer({
        id: 'toll-points',
        type: 'circle',
        source: 'toll-data',
        paint: {
            'circle-radius': 6,
            'circle-color': '#FF0000',
            'circle-stroke-width': 1,
            'circle-stroke-color': '#FFFFFF'
        }
    });

    // Show toll details on click
    map.on('click', 'toll-points', (e) => {
        const coordinates = e.features[0].geometry.coordinates.slice();
        const tollName = e.features[0].properties.toll_name;

        new mapboxgl.Popup()
            .setLngLat(coordinates)
            .setHTML(`<strong>Toll Name:</strong> ${tollName}`)
            .addTo(map);
    });

    // Change cursor on hover
    map.on('mouseenter', 'toll-points', () => {
        map.getCanvas().style.cursor = 'pointer';
    });
    map.on('mouseleave', 'toll-points', () => {
        map.getCanvas().style.cursor = '';
    });
}

// Traffic congestion data
let isTrafficVisible = false;

function toggleTrafficCongestion() {
    isTrafficVisible = !isTrafficVisible;
    updateTrafficCongestion();
}

function updateTrafficCongestion() {
    if (isTrafficVisible) {
        if (!map.getSource('traffic-points')) {
            map.addSource('traffic-points', {
                type: 'vector',
                url: 'mapbox://mapbox.mapbox-traffic-v1'
            });

            map.addLayer({
                id: 'traffic-circle-layer',
                type: 'circle',
                source: 'traffic-points',
                'source-layer': 'traffic',  
                paint: {
                    'circle-radius': 5,
                    'circle-color': [
                        'match',
                        ['get', 'congestion'],
                        'low', '#00FF00',
                        'moderate', '#FFA500',
                        'heavy', '#FF0000',
                        'severe', '#8B0000',
                        '#000000'
                    ],
                    'circle-opacity': 0.8
                }
            });
        }
    } else {
        if (map.getLayer('traffic-circle-layer')) {
            map.removeLayer('traffic-circle-layer');
            map.removeSource('traffic-points');
        }
    }
}

// Add toll data when the map loads
map.on('load', () => {
    addTollDataLayer();
    if (typeof initTrafficManagementSystem === 'function') {
        initTrafficManagementSystem();
    }
});

// Re-add toll data when the map style changes
map.on('styledata', () => {
    addTollDataLayer();
});

// Function to geocode a place name or lat,lon string
async function geocode(input) {
    if (input.includes(',')) {
        // If input is lat,lon
        const [lat, lon] = input.split(',').map(Number);
        return { latitude: lat, longitude: lon };
    } else {
        // If input is a place name, use Mapbox Geocoding API
        const response = await fetch(
            `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(input)}.json?access_token=${mapboxgl.accessToken}`
        );
        const data = await response.json();
        if (data.features.length > 0) {
            return {
                latitude: data.features[0].center[1],
                longitude: data.features[0].center[0]
            };
        } else {
            throw new Error('Location not found');
        }
    }
}

// Function to calculate and display the route
async function calculateRoute() {
    const startInput = document.getElementById('start-input').value;
    const endInput = document.getElementById('end-input').value;

    try {
        // Geocode start and end points
        const start = await geocode(startInput);
        const end = await geocode(endInput);

        // Get location names
        const startName = await getLocationName(start.longitude, start.latitude);
        const endName = await getLocationName(end.longitude, end.latitude);

        // Update markers with location names
        updateMarkers(start, end, startName, endName);

        // Fetch routes from Mapbox Directions API (requesting alternatives)
        const response = await fetch(
            `https://api.mapbox.com/directions/v5/mapbox/driving/${start.longitude},${start.latitude};${end.longitude},${end.latitude}?alternatives=true&geometries=geojson&access_token=${mapboxgl.accessToken}`
        );
        const data = await response.json();

        // Store route data for toll calculation
        routeData = data.routes.slice(0, 3);

        // Remove existing routes
        for (let i = 1; i <= 3; i++) {
            if (map.getLayer(`route-${i}`)) {
                map.removeLayer(`route-${i}`);
            }
            if (map.getSource(`route-${i}`)) {
                map.removeSource(`route-${i}`);
            }
        }

        // Add multiple routes with different colors
        const routeColors = ['#3b82f6', '#10b981', '#f43f5e'];
        const routes = data.routes.slice(0, 3); // Limit to 3 routes

        routes.forEach((route, index) => {
            map.addSource(`route-${index + 1}`, {
                type: 'geojson',
                data: {
                    type: 'Feature',
                    properties: {
                        duration: route.duration,
                        distance: route.distance
                    },
                    geometry: route.geometry
                }
            });

            map.addLayer({
                id: `route-${index + 1}`,
                type: 'line',
                source: `route-${index + 1}`,
                layout: {
                    'line-join': 'round',
                    'line-cap': 'round'
                },
                paint: {
                    'line-color': routeColors[index],
                    'line-width': 4,
                    'line-opacity': 0.75
                }
            });
        });

        // Fit the map to the combined route bounds
        const allCoordinates = routes.flatMap(route => route.geometry.coordinates);
        const bounds = allCoordinates.reduce(
            (bounds, coord) => bounds.extend(coord), 
            new mapboxgl.LngLatBounds(allCoordinates[0], allCoordinates[0])
        );
        map.fitBounds(bounds, { padding: 50 });

        // Update route info in the sidebar
        updateRouteInfo(routes);

    } catch (error) {
        alert('Error calculating routes: ' + error.message);
    }
}

// Add a function to update route information in the sidebar
// Function to update route information in the sidebar with improved UI
// Function to update route information in the sidebar with improved UI
function updateRouteInfo(routes) {
    const panelContainer = document.getElementById('route-panel-container');
    
    // Create container if it doesn't exist
    if (!panelContainer) {
        const newContainer = document.createElement('div');
        newContainer.id = 'route-panel-container';
        document.querySelector('.map-interface').appendChild(newContainer);
    }

    // Clear previous content
    panelContainer.innerHTML = '';
    panelContainer.style.display = 'none'; // Start hidden
    
    // Create route panel
    const routePanel = document.createElement('div');
    routePanel.className = 'route-panel';
    panelContainer.appendChild(routePanel);

    // Auto-height adjustment
    const updatePanelHeight = () => {
        const mapHeight = window.innerHeight;
        const topPosition = 20; // Matches CSS top value
        routePanel.style.maxHeight = `${mapHeight - topPosition - 40}px`;
    };
    
    // Remove old resize handler if exists
    if (routePanelResizeHandler) {
        window.removeEventListener('resize', routePanelResizeHandler);
    }
    
    updatePanelHeight();
    routePanelResizeHandler = updatePanelHeight;
    window.addEventListener('resize', routePanelResizeHandler);

    // Create route tabs
    const tabsContainer = document.createElement('div');
    tabsContainer.className = 'route-tabs';
    
    routes.forEach((route, index) => {
        const tab = document.createElement('div');
        tab.className = `route-tab ${index === 0 ? 'active' : ''}`;
        tab.textContent = `Route ${index + 1}`;
        tab.onclick = () => showRouteDetails(index);
        tabsContainer.appendChild(tab);
    });
    
    routePanel.appendChild(tabsContainer);
    
    // Create route content containers
    routes.forEach((route, index) => {
        const routeContent = document.createElement('div');
        routeContent.className = 'route-content';
        routeContent.id = `route-content-${index}`;
        routeContent.style.display = index === 0 ? 'block' : 'none';
        
        const distance = (route.distance / 1000).toFixed(1);
        const duration = (route.duration / 60).toFixed(0);
        const tollCount = findNearestTollsForRoute(index).length;
        
        routeContent.innerHTML = `
            <div class="route-summary">
                <div class="route-color-indicator" style="background-color: ${['#3b82f6', '#10b981', '#f43f5e'][index]};"></div>
                <div class="route-header">
                    <h3>Route ${index + 1}</h3>
                    <div class="route-metrics">
                        <div class="route-metric">
                            <div class="metric-value">${distance} km</div>
                            <div class="metric-label">Distance</div>
                        </div>
                        <div class="route-metric">
                            <div class="metric-value">${duration} min</div>
                            <div class="metric-label">Est. Time</div>
                        </div>
                        <div class="route-metric">
                            <div class="metric-value toll-badge">${tollCount}</div>
                            <div class="metric-label">Toll Points</div>
                        </div>
                    </div>
                </div>
            </div>
            
            <button class="btn-toll-details" onclick="toggleTollDetails(${index})">
                Show Toll Details
            </button>
            
            <div id="toll-details-${index}" class="toll-details" style="display: none;"></div>
        `;
        
        routePanel.appendChild(routeContent);
    });
}
function showRouteDetails(routeIndex) {
    // Hide all route contents
    document.querySelectorAll('.route-content').forEach(content => {
        content.style.display = 'none';
        content.classList.remove('active');
    });
    
    // Remove active class from all tabs
    document.querySelectorAll('.route-tab').forEach(tab => {
        tab.classList.remove('active');
    });
    
    // Show selected route content
    const selectedContent = document.getElementById(`route-content-${routeIndex}`);
    if (selectedContent) {
        selectedContent.style.display = 'block';
        selectedContent.classList.add('active');
    }
    
    // Activate selected tab
    const selectedTab = document.querySelector(`.route-tab:nth-child(${routeIndex + 1})`);
    if (selectedTab) {
        selectedTab.classList.add('active');
    }
    
    // Highlight the selected route on map
    highlightSelectedRoute(routeIndex);
}
// Toggle toll details display
function toggleTollDetails(routeIndex) {
    const tollDetails = document.getElementById(`toll-details-${routeIndex}`);
    const button = document.querySelector(`#route-content-${routeIndex} .btn-toll-details`);
    
    const isVisible = tollDetails.style.display !== 'none';
    
    if (isVisible) {
        tollDetails.style.display = 'none';
        button.textContent = 'Show Toll Details';
        
        // Remove toll highlights
        removeTollHighlights(routeIndex);
    } else {
        // Get tolls for this route
        const tolls = findNearestTollsForRoute(routeIndex);
        
        // Display toll information
        if (tolls.length === 0) {
            tollDetails.innerHTML = '<p class="no-tolls">No tolls found near this route.</p>';
        } else {
            let tollsHTML = `<h4>Number of Tolls: ${tolls.length}</h4><ul class="toll-list">`;
            
            tolls.forEach(toll => {
                tollsHTML += `<li>${toll.name} (${toll.distance.toFixed(1)} km from route)</li>`;
            });
            
            tollsHTML += '</ul>';
            tollDetails.innerHTML = tollsHTML;
        }
        
        tollDetails.style.display = 'block';
        button.textContent = 'Hide Toll Details';
        
        // Highlight toll points on map
        highlightTollsOnMap(tolls, routeIndex);
    }
}

// Highlight the selected route
function highlightSelectedRoute(routeIndex) {
    // Adjust opacity of all routes
    for (let i = 0; i < 3; i++) {
        if (map.getLayer(`route-${i + 1}`)) {
            map.setPaintProperty(`route-${i + 1}`, 'line-opacity', i === routeIndex ? 0.85 : 0.4);
            map.setPaintProperty(`route-${i + 1}`, 'line-width', i === routeIndex ? 5 : 3);
        }
    }
}

// Remove toll highlights for a route
function removeTollHighlights(routeIndex) {
    if (map.getLayer(`highlighted-tolls-${routeIndex}`)) {
        map.removeLayer(`highlighted-tolls-${routeIndex}`);
    }
    if (map.getSource(`highlighted-tolls-source-${routeIndex}`)) {
        map.removeSource(`highlighted-tolls-source-${routeIndex}`);
    }
}

// Add CSS styles for the new UI
function addMapInterfaceStyles() {
    if (!document.getElementById('map-interface-styles')) {
        const style = document.createElement('style');
        style.id = 'map-interface-styles';
        style.textContent = `
            /* Main layout */
            #map {
                width: 100%;
                height: 70vh;
            }
            
            .route-panel {
                background: white;
                border-radius: 8px 8px 0 0;
                box-shadow: 0 -4px 10px rgba(0,0,0,0.1);
                position: relative;
                padding: 16px;
                margin-top: -20px;
                z-index: 10;
            }
            
            /* Tabs */
            .route-tabs {
                display: flex;
                border-bottom: 1px solid #e0e0e0;
                margin-bottom: 16px;
            }
            
            .route-tab {
                padding: 10px 16px;
                cursor: pointer;
                font-weight: 500;
                border-bottom: 3px solid transparent;
                transition: all 0.2s;
            }
            
            .route-tab.active {
                border-bottom-color: #3b82f6;
                color: #3b82f6;
            }
            
            /* Route summary */
            .route-summary {
                display: flex;
                align-items: center;
                margin-bottom: 16px;
            }
            
            .route-color-indicator {
                width: 4px;
                height: 24px;
                margin-right: 12px;
                border-radius: 2px;
            }
            
            .route-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                width: 100%;
            }
            
            .route-header h3 {
                margin: 0;
                font-size: 18px;
            }
            
            .route-metrics {
                display: flex;
                gap: 16px;
            }
            
            .route-metric {
                text-align: center;
            }
            
            .metric-value {
                font-size: 18px;
                font-weight: 600;
            }
            
            .metric-label {
                font-size: 12px;
                color: #666;
            }
            
            .toll-badge {
                background: #FF9800;
                color: white;
                font-weight: 500;
                padding: 2px 8px;
                border-radius: 12px;
            }
            
            /* Toll details */
            .toll-details {
                background: #f5f5f5;
                border-radius: 8px;
                padding: 16px;
                margin-top: 16px;
            }
            
            .toll-list {
                list-style-type: disc;
                padding-left: 20px;
                margin-top: 8px;
            }
            
            .toll-list li {
                margin-bottom: 4px;
            }
            
            .no-tolls {
                color: #666;
                font-style: italic;
                text-align: center;
                margin: 12px 0;
            }
            
            /* Button */
            .btn-toll-details {
                background: #3b82f6;
                color: white;
                border: none;
                padding: 8px 16px;
                border-radius: 4px;
                cursor: pointer;
                width: 100%;
                font-weight: 500;
                transition: background-color 0.2s;
            }
            
            .btn-toll-details:hover {
                background: #2563eb;
            }
            
            /* Responsive adjustments */
            @media (min-width: 768px) {
                .route-panel {
                    max-width: 800px;
                    margin-left: auto;
                    margin-right: auto;
                }
            }
        `;
        document.head.appendChild(style);
    }
}
// Simple distance calculation between two points (Haversine formula)
function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Earth's radius in km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = 
        Math.sin(dLat/2) * Math.sin(dLat/2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
        Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c; // Distance in km
}

// Find the nearest toll points for a route and store them with their distances
function findNearestTollsForRoute(routeIndex) {
    if (!routeData || routeData.length <= routeIndex || !tollPointsData.length) {
        console.warn('Route data or toll data not available');
        return [];
    }

    const route = routeData[routeIndex];
    const routeCoordinates = route.geometry.coordinates;
    const nearestTolls = [];
    const searchRadius = 5; // 5km radius for tolls

    // For each toll point, find the nearest point on the route
    tollPointsData.forEach(tollPoint => {
        const tollCoord = tollPoint.geometry.coordinates;
        const tollName = tollPoint.properties.toll_name;
        const tollId = tollPoint.properties.id || tollPoint.id || tollName;
        
        let minDistance = Infinity;
        let closestPoint = null;
        
        // Find the closest point on the route to this toll
        for (const routeCoord of routeCoordinates) {
            const distance = calculateDistance(
                tollCoord[1], tollCoord[0],  // lat, lon of toll point
                routeCoord[1], routeCoord[0] // lat, lon of route point
            );
            
            if (distance < minDistance) {
                minDistance = distance;
                closestPoint = routeCoord;
            }
        }
        
        // If the toll is within our search radius, add it to nearestTolls
        if (minDistance <= searchRadius) {
            nearestTolls.push({
                id: tollId,
                name: tollName,
                coordinates: tollCoord,
                distance: minDistance,
                closestPoint: closestPoint
            });
        }
    });
    
    // Sort tolls by distance from route
    nearestTolls.sort((a, b) => a.distance - b.distance);
    
    return nearestTolls;
}

// Function to show tolls for a specific route
function showTollsForRoute(routeIndex) {
    const tollInfoContainer = document.getElementById(`tolls-route-${routeIndex}`);
    if (!tollInfoContainer) return;
    
    // Toggle display
    const isDisplayed = tollInfoContainer.style.display !== 'none';
    tollInfoContainer.style.display = isDisplayed ? 'none' : 'block';
    
    // If we're hiding the container, return early
    if (isDisplayed) {
        const button = document.querySelector(`.route-option:nth-child(${routeIndex + 1}) .show-tolls-btn`);
        if (button) button.textContent = 'Show Tolls';
        return;
    }
    
    // Update button text
    const button = document.querySelector(`.route-option:nth-child(${routeIndex + 1}) .show-tolls-btn`);
    if (button) button.textContent = 'Hide Tolls';
    
    // Find the tolls for this route
    const tolls = findNearestTollsForRoute(routeIndex);
    
    if (tolls.length === 0) {
        tollInfoContainer.innerHTML = '<p>No tolls found near this route.</p>';
        return;
    }
    
    // Format toll list like in the screenshot
    let tollHTML = `<div class="number-of-tolls">Number of Tolls: ${tolls.length}</div><ul>`;
    
    tolls.forEach(toll => {
        tollHTML += `<li>${toll.name} (${toll.distance.toFixed(1)} km from route)</li>`;
    });
    
    tollHTML += '</ul>';
    tollInfoContainer.innerHTML = tollHTML;
    
    // Highlight the tolls on the map
    highlightTollsOnMap(tolls, routeIndex);
}

// Function to highlight tolls on the map
function highlightTollsOnMap(tolls, routeIndex) {
    // Remove any existing highlighted tolls layers
    if (map.getLayer(`highlighted-tolls-${routeIndex}`)) {
        map.removeLayer(`highlighted-tolls-${routeIndex}`);
    }
    if (map.getSource(`highlighted-tolls-source-${routeIndex}`)) {
        map.removeSource(`highlighted-tolls-source-${routeIndex}`);
    }
    
    if (tolls.length === 0) return;
    
    // Create a GeoJSON source with the toll points
    const tollsGeoJSON = {
        type: 'FeatureCollection',
        features: tolls.map(toll => ({
            type: 'Feature',
            properties: { 
                name: toll.name,
                distance: toll.distance.toFixed(1),
                routeIndex: routeIndex
            },
            geometry: {
                type: 'Point',
                coordinates: toll.coordinates
            }
        }))
    };
    
    // Add the source and layer to highlight these tolls
    map.addSource(`highlighted-tolls-source-${routeIndex}`, {
        type: 'geojson',
        data: tollsGeoJSON
    });
    
    map.addLayer({
        id: `highlighted-tolls-${routeIndex}`,
        type: 'circle',
        source: `highlighted-tolls-source-${routeIndex}`,
        paint: {
            'circle-radius': 8,
            'circle-color': ['#3b82f6', '#10b981', '#f43f5e'][routeIndex],
            'circle-stroke-width': 2,
            'circle-stroke-color': '#FFFFFF',
            'circle-opacity': 0.8
        }
    });
    
    // Change cursor on hover (no click events for popups)
    map.on('mouseenter', `highlighted-tolls-${routeIndex}`, () => {
        map.getCanvas().style.cursor = 'pointer';
    });
    map.on('mouseleave', `highlighted-tolls-${routeIndex}`, () => {
        map.getCanvas().style.cursor = '';
    });
}
// Add styles for toll info section
document.addEventListener('DOMContentLoaded', function() {
    const style = document.createElement('style');
    style.textContent = `
        .number-of-tolls {
            font-weight: bold;
            margin-bottom: 10px;
        }
        
        .toll-info {
            background-color: #f8f9fa;
            border-radius: 4px;
            padding: 12px;
            margin-top: 10px;
        }
        
        .toll-info ul {
            list-style-type: disc;
            padding-left: 20px;
            margin-top: 8px;
        }
        
        .toll-info li {
            padding: 3px 0;
        }
    `;
    document.head.appendChild(style);
});

// Function to get location name from coordinates
async function getLocationName(longitude, latitude) {
    try {
        const response = await fetch(
            `https://api.mapbox.com/geocoding/v5/mapbox.places/${longitude},${latitude}.json?access_token=${mapboxgl.accessToken}`
        );
        const data = await response.json();
        
        if (data.features.length > 0) {
            return data.features[0].place_name || `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`;
        }
        return `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`;
    } catch (error) {
        console.error('Error getting location name:', error);
        return `${latitude.toFixed(4)}, ${longitude.toFixed(4)}`;
    }
}

// Modify updateMarkers to accept and display location names
function updateMarkers(startCoords, endCoords, startName, endName) {
    // Remove existing markers if they exist
    if (startMarker) startMarker.remove();
    if (endMarker) endMarker.remove();

    // Add new markers with popups
    startMarker = new mapboxgl.Marker({ color: '#4CAF50' })
        .setLngLat([startCoords.longitude, startCoords.latitude])
        .setPopup(new mapboxgl.Popup().setHTML(`<strong>Start:</strong> ${startName}`))
        .addTo(map);

    endMarker = new mapboxgl.Marker({ color: '#F44336' })
        .setLngLat([endCoords.longitude, endCoords.latitude])
        .setPopup(new mapboxgl.Popup().setHTML(`<strong>End:</strong> ${endName}`))
        .addTo(map);

    // Open popups by default
    startMarker.getPopup().addTo(map);
    endMarker.getPopup().addTo(map);
}