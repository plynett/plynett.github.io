
% create variables for ranges of inputs
depth = 5; % depth at wave generator
surge = [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5]; % additional water level 
Hs = [0, 0.5, 1, 1.5, 2]; % short-wave sig wave height
Tp = [6, 10, 12, 15, 20]; % peak wave period
HRMS = [0, 0.25, 0.5, 0.75, 1]; % H_RMS for IG wave
T_IG = [0, 60, 96, 120, 240, 300]; % IG wave periods

% create combinations and remove unuseful scenarios
combos = combinations(depth,surge,Hs,Tp,HRMS,T_IG); 
combos(find(combos.HRMS==0 & combos.T_IG~=0),:)=[];
combos(find(combos.HRMS~=0 & combos.T_IG==0),:)=[];