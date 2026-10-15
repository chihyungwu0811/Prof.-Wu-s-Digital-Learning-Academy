'use client';
import { useState } from 'react';
export function FluidDemo(){
const [a1,setA1]=useState(.012),[a2,setA2]=useState(.004),[q,setQ]=useState(.02);
const v1=q/a1,v2=q/a2,p2=200000+.5*998*(v1*v1-v2*v2),h1=37*Math.sqrt(a1/.012),h2=37*Math.sqrt(a2/.012);
return <section className="simulator"><div className="sim-head"><span className="sim-live"/>INTERACTIVE MODEL · WATER, 20°C</div>
<h3>What happens when a pipe narrows?</h3><p>Adjust cross-sectional area and flow rate. Compare velocity and static pressure at two points in a horizontal pipe.</p>
<svg className="pipe-svg" viewBox="0 0 600 180" role="img" aria-label="Horizontal pipe narrowing along the flow direction">
<defs><linearGradient id="water" x1="0" x2="1"><stop stopColor="#9adcc5"/><stop offset="1" stopColor="#4ca78a"/></linearGradient></defs>
<path d={'M25 '+(90-h1)+'H265Q300 '+(90-h1)+' 330 '+(90-h2)+'H575V'+(90+h2)+'H330Q300 '+(90+h1)+' 265 '+(90+h1)+'H25Z'} fill="url(#water)" stroke="#509581" strokeWidth="2"/>
<path d="M55 90H205 M350 90H540" stroke="white" strokeWidth="3" strokeDasharray="12 10"/>
<path d="m190 82 15 8-15 8m335-16 15 8-15 8" fill="none" stroke="white" strokeWidth="3"/>
<circle cx="225" cy="90" r="6" fill="#fff" stroke="#4a8874" strokeWidth="2"/><circle cx="490" cy="90" r="6" fill="#fff" stroke="#4a8874" strokeWidth="2"/>
<text x="195" y="35" fill="#497869" fontSize="14">Point 1</text><text x="460" y="35" fill="#497869" fontSize="14">Point 2</text>
<text x="180" y="158" fill="#648379" fontSize="12">Wide section</text><text x="430" y="158" fill="#648379" fontSize="12">Narrow section</text></svg>
<div className="sim-controls">
<label>Area at point 1 <strong>{a1.toFixed(3)} m²</strong><input type="range" min=".006" max=".018" step=".001" value={a1} onChange={e=>{let n=+e.target.value;setA1(n);if(a2>=n)setA2(Math.max(.002,n-.001))}}/></label>
<label>Area at point 2 <strong>{a2.toFixed(3)} m²</strong><input type="range" min=".002" max={Math.max(.003,a1-.001)} step=".001" value={a2} onChange={e=>setA2(+e.target.value)}/></label>
<label>Volume flow rate <strong>{q.toFixed(3)} m³/s</strong><input type="range" min=".005" max=".04" step=".001" value={q} onChange={e=>setQ(+e.target.value)}/></label></div>
<div className="sim-results"><div><small>Velocity · point 1</small><strong>{v1.toFixed(2)} <i>m/s</i></strong></div><div><small>Velocity · point 2</small><strong>{v2.toFixed(2)} <i>m/s</i></strong></div><div><small>Pressure · point 1</small><strong>200 <i>kPa</i></strong></div><div><small>Pressure · point 2</small><strong>{(p2/1000).toFixed(1)} <i>kPa</i></strong></div></div>
<div className="sim-note">Continuity: <b>Q = Av</b> · Bernoulli (horizontal, ideal flow): <b>p + ½ρv² = constant</b>. Assumes steady, incompressible flow; losses are neglected.</div></section>
}
