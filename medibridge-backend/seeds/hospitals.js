/* Same demo hospitals the frontend uses (fictional names). lat/lng are approximate Delhi NCR demo positions. */
module.exports = [
  { _id: 'H1', name: 'Riverside Heart Institute', area: 'Sector 12', km: 3.2, eta: 9, icu: 3, vent: 2, load: 'Low', care: ['Emergency', 'Cardiac'], src: 'Verified', x: 270, y: 80, lat: 28.5985, lng: 77.343 },
  { _id: 'H2', name: 'City General Hospital', area: 'Central Market Road', km: 1.8, eta: 7, icu: 1, vent: 1, load: 'High', care: ['Emergency', 'Trauma', 'Cardiac'], src: 'Declared', x: 150, y: 150, lat: 28.6315, lng: 77.2167 },
  { _id: 'H3', name: 'Lotus Women & Child Care', area: 'Sector 21', km: 4.5, eta: 13, icu: 4, vent: 3, load: 'Low', care: ['Emergency', 'Maternity'], src: 'Verified', x: 90, y: 70, lat: 28.5878, lng: 77.324 },
  { _id: 'H4', name: 'Metro Trauma Centre', area: 'Ring Road', km: 2.6, eta: 8, icu: 2, vent: 2, load: 'Moderate', care: ['Emergency', 'Trauma'], src: 'Verified', x: 210, y: 230, lat: 28.6097, lng: 77.245 },
  { _id: 'H5', name: 'Sunrise Multispeciality', area: 'Sector 44', km: 5.9, eta: 16, icu: 5, vent: 4, load: 'Low', care: ['Emergency', 'Cardiac', 'Maternity', 'Trauma'], src: 'Estimated', x: 330, y: 200, lat: 28.443, lng: 77.056 },
  { _id: 'H6', name: 'Green Park Clinic', area: 'Green Park Colony', km: 1.2, eta: 5, icu: 0, vent: 0, load: 'Saturated', care: ['Emergency', 'Maternity'], src: 'Simulated', x: 60, y: 210, lat: 28.5494, lng: 77.2001 }
];
