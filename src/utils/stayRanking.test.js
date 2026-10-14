import test from 'node:test';
import assert from 'node:assert/strict';
import { rankStays, quickStayDate } from './stayRanking.js';
import { calculateBalconySunDay, venueDayBounds } from './balconySunEngine.js';
const room = (orientation, name = orientation) => ({ id: name, name, orientation, floorLevel: 12 });
const stay = (name, rooms) => ({ id: name, venueName: name, typeCategory: 'Hotel', lat: -37.81, lng: 144.96, roomTypes: rooms });
const date = '2026-10-04';
test('coffee and sunset select and order the matching rooms without mutating venues', () => {
  const east = stay('East', [room('E')]), west = stay('West', [room('W')]);
  assert.equal(rankStays([west, east], { moment: 'coffee', date })[0].id, 'East');
  assert.equal(rankStays([east, west], { moment: 'sunset', date })[0].id, 'West');
  assert.equal(rankStays([stay('Both', [room('E'), room('W')])], {moment:'sunset',date})[0].bestRoom.orientation, 'W');
  assert.equal(east.bestRoom, undefined);
});
test('most sun uses total exposure, ties use total sun then venue and room names', () => {
  const options = {lat:-37.81,lng:144.96,facing:'N',date};
  const total = calculateBalconySunDay(options).totalMinutes;
  const result = rankStays([stay('Z', [room('N','Z'),room('N','A')]),stay('A',[room('N')])], {moment:'most',date});
  assert.equal(result[0].venueName,'A'); assert.equal(result[0].minutes,total); assert.equal(result[1].bestRoom.name,'A');
  // Both rooms cover the entire sunset interval; total exposure breaks the tie.
  const tied = rankStays([stay('West',[room('W')]),stay('Northwest',[room('NW')])], {moment:'sunset',date});
  assert.equal(tied[0].minutes,tied[1].minutes);
  assert.equal(tied[0].id,'Northwest');
  assert.ok(tied[0].totalMinutes > tied[1].totalMinutes);
});
test('missing, invalid and fully obstructed rooms sort last honestly; bars are excluded', () => {
  const result = rankStays([stay('Missing'),stay('Blocked',[{...room('E'),obstructions:[{start:0,end:360,minAltitude:90}]}]),stay('Sun',[room('E')]),{...stay('Bar',[room('E')]),typeCategory:'Bar'},stay('Invalid',[room('oops')])],{moment:'coffee',date});
  assert.equal(result[0].id,'Sun'); assert.equal(result.length,4);
  for(const v of result.slice(1)) { assert.equal(v.minutes,0);assert.equal(v.bestRoom,null);assert.equal(v.windowsText,''); }
});
test('Melbourne DST uses the venue calendar date and a 23-hour day', () => {
  const bounds = venueDayBounds(date);assert.equal(bounds.end-bounds.start,23*3600000);
  const venue = stay('DST',[room('E')]);
  for(const instant of [new Date('2026-10-03T14:30:00Z'),new Date('2026-10-04T12:30:00Z')]) {
    const result = rankStays([venue],{moment:'coffee',date:instant})[0];
    assert.equal(result.daily.date,date);assert.equal(result.minutes,rankStays([venue],{moment:'coffee',date})[0].minutes);
  }
  assert.equal(quickStayDate('tomorrow',new Date('2026-10-03T02:00:00Z')),date);
  assert.equal(quickStayDate('tomorrow',new Date('2026-10-04T02:00:00Z')),'2026-10-05');
  assert.equal(quickStayDate('saturday',new Date('2026-10-04T02:00:00Z')),'2026-10-10');
});
test('absolute dates respect venue timezone and invalid dates are rejected', () => {
  const result = rankStays([{...stay('UTC',[room('E')]),timeZone:'UTC'}],{moment:'most',date:new Date('2026-10-03T14:30:00Z')})[0];
  assert.equal(result.daily.date,'2026-10-03');
  assert.throws(()=>rankStays([],{date:'2026-02-30'}),RangeError);
  assert.throws(()=>rankStays([],{moment:'invalid',date}),RangeError);
});
