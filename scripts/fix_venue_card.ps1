$filePath = "c:\Users\user\Downloads\email gemini_files\sunstay-app\src\components\VenueCard.jsx"
$lines = Get-Content $filePath
$newBlock = @'
                                                        </div>
                                                    </>
                                                );
                                            })()}
                                        </div>

                                        {/* Weather Description */}
                                        <div className={`mt-3 p-3 rounded-xl ${theme === 'sunny' ? 'bg-amber-100/70' :
                                            theme === 'rainy' ? 'bg-blue-100/70' :
                                                'bg-gray-100/70'
                                            }`}>
                                            <div className="flex items-center gap-2">
                                                <WeatherIcon />
                                                <p className="text-sm text-gray-700 font-medium">
                                                    {weatherDescription}
                                                </p>
                                            </div>
                                        </div>
'@
# Lines 625-642 (1-indexed) are indices 624-641
$result = $lines[0..623] + $newBlock + $lines[642..($lines.Length-1)]
$result | Set-Content $filePath
